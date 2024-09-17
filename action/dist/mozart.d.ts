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
export declare function mozart(options: MozartOptions): Promise<string>;
export {};
