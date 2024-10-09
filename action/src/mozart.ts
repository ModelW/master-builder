import { exec as execNode } from "node:child_process";
import { promisify } from "node:util";
import {
    JsonObject,
    JsonValue,
    Resolver,
} from "@model-w/hydroyaml/dist/resolving";
import { fromString } from "@model-w/hydroyaml";
import { deepResolve, isArray, isObject } from "./obj-manip";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { shQuote } from "./mb";

const exec = promisify(execNode);

/**
 * Options for the Mozart function.
 *
 * @see mozart
 */
interface MozartOptions {
    /** Directory in which Docker Compose is located. */
    composeDir: string;
    /** Template to generate image names. */
    imageTemplate: string;
    /** Environment variables for each service, $ is the compose environment. */
    environments: Record<string, Record<string, string>>;
    /** The name of the project to deploy */
    projectName: string;
}

/**
 * The composer (Mozart, compose, ...) in charge of composing the compose file
 * from Docker compose.
 *
 * The idea is simply to modify the compose file to integrate our customized
 * stuff (see the README.md for the full vision of how the GHA works).
 *
 * The inputs we got are:
 *
 * - The directory in which the compose project is located
 * - The various environment variables for each "image"
 * - The template to generate image names
 *
 * The output is the modified compose file.
 *
 * We call the Compose CLI directly to read the compose file, so we don't have
 * to implement all the interpolation rules and file searching logic and other
 * things from Docker Compose, we just let it natively read its configuration
 * and dump it in JSON. Then we tweak the JSON and return it as a string.
 */
export async function mozart(options: MozartOptions): Promise<string> {
    const composeFile = await readComposeFile(
        options.composeDir,
        options.environments.$ || {}
    );
    const serviceMap = makeServiceMap(composeFile);
    const imageTemplate = await makeImageTemplate(
        composeFile,
        options.imageTemplate
    );

    let patched = composeFile;
    patched = await substituteImages(patched, serviceMap, imageTemplate);
    patched = injectEnvironment(patched, serviceMap, options.environments);
    patched = fixName(options.projectName, patched);
    patched = disarm(patched) as JsonObject;

    return JSON.stringify(patched);
}

/**
 * Reads the compose file using the Docker Compose process.
 * @param composeDir The directory in which the compose file is located
 * @param environment Environment variables to pass to the Docker Compose process
 */
async function readComposeFile(
    composeDir: string,
    environment: Record<string, string>
): Promise<JsonObject> {
    const cmd = `docker compose config --format json`;
    const { stdout } = await exec(cmd, {
        cwd: composeDir,
        env: {
            ...process.env,
            ...environment,
        },
    });

    return JSON.parse(stdout);
}

/**
 * Second-order function to generate image name based on component name
 *
 * @param composeFile Full version of the compose file
 * @param imageTemplate Template given by the user
 */
async function makeImageTemplate(
    composeFile: JsonValue,
    imageTemplate: string
) {
    const document = await fromString(JSON.stringify(composeFile))();

    return async function (serviceName: string): Promise<string> {
        const resolver = new Resolver(document, {
            service: { name: serviceName },
        });
        return await resolver.resolve(imageTemplate);
    };
}

/**
 * Substitutes the build sections by image sections
 *
 * @param composeFile Compose file to modify
 * @param serviceMap Map of service name to component name
 * @param imageTemplate Function to generate image name
 */
async function substituteImages(
    composeFile: JsonObject,
    serviceMap: Record<string, string>,
    imageTemplate: (serviceName: string) => Promise<string>
): Promise<JsonObject> {
    const { services } = composeFile;

    if (!isObject(services)) {
        return composeFile;
    }

    return {
        ...composeFile,
        services: await deepResolve(
            Object.fromEntries(
                Object.entries(services).map(([serviceName, service]) => {
                    if (!isObject(service) || !("build" in service)) {
                        return [serviceName, service];
                    }

                    return [
                        serviceName,
                        (async function () {
                            return {
                                ...Object.fromEntries(
                                    Object.entries(service).filter(
                                        ([key]) => key !== "build"
                                    )
                                ),
                                image: await imageTemplate(
                                    serviceMap[serviceName]
                                ),
                            };
                        })(),
                    ];
                })
            )
        ),
    };
}

/**
 * Injects the environment variables into the compose file
 *
 * @param composeFile Compose file to modify
 * @param serviceMap Map of service name to component name
 * @param env Map of environment variables for each component
 */
function injectEnvironment(
    composeFile: JsonObject,
    serviceMap: Record<string, string>,
    env: Record<string, Record<string, string>>
): JsonObject {
    const { services } = composeFile;

    if (!isObject(services)) {
        return composeFile;
    }

    return {
        ...composeFile,
        services: Object.fromEntries(
            Object.entries(services).map(([serviceName, service]) => {
                if (!isObject(service)) {
                    return [serviceName, service];
                }

                return [
                    serviceName,
                    {
                        ...service,
                        environment: mergeEnvironments(
                            env[serviceMap[serviceName]] || {},
                            service.environment
                        ),
                    },
                ];
            })
        ),
    };
}

/**
 * Takes into account the original format of the environment parameter (which
 * can be either an object or an array of strings) and merges the two together.
 */
function mergeEnvironments(
    additionalEnv: Record<string, string>,
    originalEnv: any
): Record<string, string> | string[] {
    if (isArray(originalEnv)) {
        const additionalEnvArray = Object.entries(additionalEnv).map(
            ([key, value]) => `${key}=${shQuote(value)}`
        );
        return [...additionalEnvArray, ...(originalEnv as string[])];
    } else if (isObject(originalEnv)) {
        return {
            ...additionalEnv,
            ...(originalEnv as Record<string, string>),
        };
    } else {
        return additionalEnv;
    }
}

/**
 * Makes a map of service name to component name. The component name is just the
 * name of the directory pointed by the build section.
 * @param composeFile Full version of the compose file
 */
function makeServiceMap(composeFile: JsonValue): Record<string, string> {
    const out: Record<string, string> = {};

    if (!isObject(composeFile)) {
        return out;
    }

    const { services } = composeFile;

    if (!isObject(services)) {
        return out;
    }

    Object.entries(services).forEach(([serviceName, service]) => {
        if (isObject(service)) {
            if (typeof service.build === "string") {
                out[serviceName] = basename(service.build);
            } else if (
                isObject(service.build) &&
                typeof service.build.context === "string"
            ) {
                out[serviceName] = basename(service.build.context);
            }
        }
    });

    return out;
}

/**
 * Compose automatically adds the 'name' attribute at the root of the compose
 * file, but it's not good for our blue/green strategy because you'll shut
 * down the new deployment when shutting down the old one. Se we make a new
 * name that consists of the GHA input name and suffix it with a 8-char
 * hash of the current compose file's + current timestamp hash.
 *
 * @param projectName The name of the project to deploy
 * @param composeFile The compose file to fix
 */
function fixName(projectName: string, composeFile: JsonObject): JsonObject {
    const asString = `${new Date().getTime()}:${JSON.stringify(composeFile)}`;
    const hash = createHash("sha256");
    hash.update(asString);
    const name = `${projectName}-${hash.digest("hex").slice(0, 8)}`;

    return { ...composeFile, name };
}

/**
 * Docker Compose will look for variables and interpolate them, but we know
 * that there are no variables. So we escape all the $ in order to get it to
 * stop messing up with our variables.
 */
function disarm(val: JsonValue): JsonValue {
    if (isObject(val)) {
        return Object.fromEntries(
            Object.entries(val).map(([key, value]) => [key, disarm(value)])
        );
    } else if (isArray(val)) {
        return val.map(disarm);
    } else if (typeof val === "string") {
        return val.replace(/\$/g, "$$");
    } else {
        return val;
    }
}
