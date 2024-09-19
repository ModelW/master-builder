import { Client } from "ssh2";

/**
 * Options for Master Builder to know what to do
 */
export interface MasterBuilderOptions {
    /** Options for the SSH connection */
    ssh: SshOptions;
    /** The command to run once on the server */
    command: string;
}

/**
 * Options for the SSH connection
 */
export interface SshOptions {
    /** The host to connect to */
    host: string;
    /** The port to connect to */
    port: number;
    /** The user to connect as */
    user: string;
    /** The credentials to use */
    credentials: SshPrivateKey | SshPassword;
}

/**
 * SSH credentials for a private key
 */
export interface SshPrivateKey {
    /** The private key to use, in OpenSSH format */
    privateKey: string;
    /** If any, the passphrase to use for the private key */
    passphrase?: string;
}

/**
 * SSH credentials for a password
 */
export interface SshPassword {
    /** The password to use to connect to the server */
    password: string;
}

/**
 * A command to run before or after deployment
 */
export interface Command {
    /** The service to run the command in */
    service: string;
    /** The command to run */
    command: string;
}

/**
 * Options for the deployment in itself
 */
export interface DeployOptions {
    /** The name of the project to deploy */
    projectName: string;
    /** The command to run before deployment */
    before: Command[];
    /** The command to run after deployment */
    after: Command[];
    /** The content of the compose file */
    composeFile: string;
}

/**
 * The outcome of the deployment
 */
export interface DeployOutput {
    /** The standard error output of the deployment */
    stderr: string;
    /** Whether the deployment was successful */
    success: boolean;
}

/**
 * A function that reports the stdout of the deployment in real time, to have a
 * nice live feedback for the user.
 */
type reporter = (message: string) => void;

/**
 * Quotes a string for the shell
 *
 * @param str The string to quote
 * @returns The quoted string
 */
function shQuote(str: string): string {
    if (!str) {
        return "''";
    }

    if (!/[^\w@%+=:,./-]/.test(str)) {
        return str;
    }

    return "'" + str.replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Parses a SSH URL into an object which can be used to connect to the server.
 * The URL must be in the format `ssh://[user[:password]@]host[:port]`. If the
 * private key is provided the password is used as the passphrase, otherwise the
 * password is used as the password.
 *
 * @param url The URL to parse
 * @param privateKey The private key to use, if any
 * @returns The parsed URL
 */
export function parseSshUrl(url: string, privateKey?: string): SshOptions {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "ssh:") {
        throw new Error("Invalid SSH URL: Protocol must be ssh://");
    }

    const host = parsedUrl.hostname || "localhost";
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 22;
    const user = parsedUrl.username || "root";
    const password = parsedUrl.password || "";

    if (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") {
        throw new Error("Invalid SSH URL: Path must not be specified");
    }

    return {
        host,
        port,
        user,
        credentials: privateKey
            ? { privateKey, passphrase: password }
            : { password },
    };
}

/**
 * Parses a list of commands into an array of objects (for the before/after
 * feature).
 */
export function parseCommands(commands: string): Command[] {
    if (!commands.trim()) {
        return [];
    }

    return commands.split("\n").map((fullCommand) => {
        const re = /([^:]+):(.+)/;
        const match = fullCommand.trim().match(re);

        if (!match) {
            throw new Error("Invalid command format");
        }

        const [, service, command] = match;

        if (!service || !command) {
            throw new Error("Invalid command format");
        }

        return { service, command };
    });
}

/**
 * Does the deployment through SSH using Master Builder.
 */
export function deploy(
    host: MasterBuilderOptions,
    deploy: DeployOptions,
    reporter: reporter
): Promise<DeployOutput> {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on("ready", () => {
            let cmd = `${host.command} deploy ${deploy.projectName}`;

            for (const before of deploy.before) {
                cmd += ` --before ${shQuote(before.service)}:${shQuote(before.command)}`;
            }

            for (const after of deploy.after) {
                cmd += ` --after ${shQuote(after.service)}:${shQuote(after.command)}`;
            }

            reporter(`Running: ${cmd}`);

            conn.exec(cmd, (err, stream) => {
                if (err) {
                    reject(err);
                }

                stream.stdin.write(deploy.composeFile, () => {
                    stream.stdin.end();
                });

                stream.on("data", (data: Buffer | string) => {
                    reporter(data.toString());
                });

                stream.on("close", (code: number) => {
                    resolve({
                        stderr: stream.stderr.read().toString(),
                        success: code === 0,
                    });
                });
            });
        })
            .on("error", (err) => {
                reject(err);
            })
            .connect({
                host: host.ssh.host,
                port: host.ssh.port,
                username: host.ssh.user,
                ...("privateKey" in host.ssh.credentials
                    ? {
                          privateKey: host.ssh.credentials.privateKey,
                          passphrase: host.ssh.credentials.passphrase,
                      }
                    : {
                          privateKey: host.ssh.credentials.password,
                      }),
            });
    });
}
