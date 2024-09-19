import * as core from "@actions/core";
import * as github from "@actions/github";
import yaml from "yaml";
import fs from "fs/promises";
import { isObject } from "./obj-manip";
import { mozart } from "./mozart";
import {
    deploy,
    DeployOptions,
    parseCommands,
    parseSshUrl,
    SshOptions,
} from "./mb";

/**
 * Reads and validates the input regarding the compose file
 */
async function getComposeDir(): Promise<string> {
    const dir = core.getInput("compose_dir");
    const stat = await fs.stat(dir);

    if (!stat.isDirectory()) {
        throw new Error(`Compose directory ${dir} is not a directory`);
    }

    return dir;
}

/**
 * Reads and validates the input regarding the environment variables
 */
function getEnv(): Record<string, Record<string, string>> {
    const env = yaml.parse(core.getInput("env") || "{}", {
        prettyErrors: true,
    });

    if (!isObject(env)) {
        throw new Error("Env should be an object");
    }

    if (!Object.values(env).every(isObject)) {
        throw new Error("Env should be an object of objects");
    }

    return env as Record<string, Record<string, string>>;
}

/**
 * Reads and validates the input(s) regarding the SSH connection
 */
function getSshConfig(): SshOptions {
    return parseSshUrl(
        core.getInput("ssh_url"),
        core.getInput("ssh_private_key")
    );
}

/**
 * Reads and validates the input(s) regarding the deployment in itself
 * @param composeFile The generated compose file
 */
function getDeploy(composeFile: string): DeployOptions {
    return {
        composeFile: composeFile,
        projectName: github.context.repo.repo,
        after: parseCommands(core.getInput("after")),
        before: parseCommands(core.getInput("before")),
    };
}

/**
 * Main function to unfold the whole thing
 */
export async function main(): Promise<void> {
    try {
        const compose = await mozart({
            composeDir: await getComposeDir(),
            imageTemplate: core.getInput("image_tpl"),
            environments: getEnv(),
        });

        const deployConfig = getDeploy(compose);
        const options = {
            ssh: getSshConfig(),
            command: core.getInput("master_builder_command"),
        };

        const outcome = await deploy(
            options,
            deployConfig,
            (message: string) => {
                core.info(message);
            }
        );

        if (!outcome.success) {
            // noinspection ExceptionCaughtLocallyJS
            throw new Error(`Master Builder failed:\n${outcome.stderr}`);
        }
    } catch (e) {
        if (e instanceof Error) {
            core.setFailed(e.message);
        } else {
            core.setFailed("Unknown failure");
        }

        process.exit(1);
    }

    process.exit(0);
}
