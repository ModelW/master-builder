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
 * Parses a SSH URL into an object which can be used to connect to the server.
 * The URL must be in the format `ssh://[user[:password]@]host[:port]`. If the
 * private key is provided the password is used as the passphrase, otherwise the
 * password is used as the password.
 *
 * @param url The URL to parse
 * @param privateKey The private key to use, if any
 * @returns The parsed URL
 */
export declare function parseSshUrl(url: string, privateKey?: string): SshOptions;
/**
 * Parses a list of commands into an array of objects (for the before/after
 * feature).
 */
export declare function parseCommands(commands: string): Command[];
/**
 * Does the deployment through SSH using Master Builder.
 */
export declare function deploy(host: MasterBuilderOptions, deploy: DeployOptions, reporter: reporter): Promise<DeployOutput>;
export {};
