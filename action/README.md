# Master Builder Action

The point of this action is to allow using the project's `compose.yml` in order
to deploy onto a remote server using Master Builder.

It can be used like this:

```yaml
- name: Deploy using Master Builder
  uses: modelw/master-builder@develop
  with:
      image_tpl:
          "<your-registry>/${{ github.event.repository.name }}/{{ .service.name
          }}:${{ github.sha }}"
      env: "${{ secrets.MASTER_BUILDER_ENV }}"
      ssh_url: "ssh://user@host"
      ssh_private_key: "${{ secrets.MASTER_BUILDER_SSH_PRIVATE_KEY }}"
      before: "api:./manage.py migrate"
```

In your `docker-compose.yml`, all services with a `build` section will see that
section replaced by an image name following the template provided in `image_tpl`
and interpreted by [hydroyaml](https://github.com/ModelW/hydroyaml).

The provided context when interpolating `image_tpl` looks like:

```yaml
service:
    name: "<name of the built folder>"
```

Then the `env` contains environment variables that will be injected in the
corresponding services in the following format:

```yaml
$:
    DOMAIN: some-domain.com

api:
    SECRET_KEY: yolo
    DATABASE_URL: postgres://...

front:
    API_URL: http://api:8000
```

Let's note two things:

-   The special key `$` will be injected when evaluating the Compose file,
    following
    [interpolation](https://docs.docker.com/reference/compose-file/interpolation/)
    rules
-   The other keys are matching the name of the build folder, **not** the name
    of the service in the compose file

If you defined variables in the `environment` section of the Compose file, they
will be overriding the variables defined in the provided environment.

## Reference

Here's a detailed reference of all available options for the Master Builder
Action:

### `compose_dir`

-   **Description**: The directory holding the compose file.
-   **Default**: "." (current directory)
-   **Rationale**: This allows you to specify a different location for your
    Docker Compose file if it's not in the root of your repository.
-   **Example**:
    ```yaml
    compose_dir: "./docker"
    ```

### `image_tpl`

-   **Description**: The image template to use for replacing `build` sections in
    the Compose file.
-   **Required**: Yes
-   **Rationale**: This template is used to generate consistent image names for
    your services, typically including the registry, repository name, service
    name, and a tag (often the commit SHA for traceability).
-   **Example**:
    ```yaml
    image_tpl:
        "ghcr.io/${{ github.repository }}/{{ .service.name }}:${{ github.sha }}"
    ```

### `env`

-   **Description**: A YAML-encoded object containing all environment variables
    for the various components.
-   **Required**: No
-   **Rationale**: This allows you to inject environment-specific configurations
    into your services without hardcoding them in the Compose file.
-   **Example**:
    ```yaml
    env: |
        $:
          DOMAIN: myapp.com
        api:
          DEBUG: "False"
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        front:
          API_URL: https://api.myapp.com
    ```

### `ssh_url`

-   **Description**: A SSH URL in the format `ssh://user@host:port`.
-   **Required**: Yes
-   **Rationale**: This specifies the target server for deployment. The port is
    optional and defaults to 22 if not provided.
-   **Example**:
    ```yaml
    ssh_url: "ssh://deployer@myserver.com:2222"
    ```

### `ssh_private_key`

-   **Description**: The SSH private key to use for authentication.
-   **Required**: No
-   **Default**: "" (empty string)
-   **Rationale**: This allows secure, key-based authentication to the
    deployment server. If provided along with a password in the SSH URL, the
    password is used as the key's passphrase.
-   **Example**:
    ```yaml
    ssh_private_key: ${{ secrets.DEPLOY_SSH_KEY }}
    ```

### `master_builder_command`

-   **Description**: The command to run Master Builder on the remote server.
-   **Default**: "uvx --from
    https://github.com/ModelW/master-builder/archive/refs/heads/develop.zip
    master-builder"
-   **Rationale**: This allows you to specify a different version of Master
    Builder or use a custom installation method.
-   **Example**:
    ```yaml
    master_builder_command: "/usr/local/bin/master-builder"
    ```

### `project_name`

-   **Description**: The name of the project to deploy.
-   **Default**: "" (empty string, which results in using the repository name)
-   **Rationale**: This allows you to override the project name used by Master
    Builder, which can be useful in cases where the repository name is not
    suitable as a project name.
-   **Example**:
    ```yaml
    project_name: "my-awesome-app"
    ```

### `before`

-   **Description**: Commands to run before deployment, one per line in the
    `service:command` format.
-   **Required**: No
-   **Default**: "" (empty string)
-   **Rationale**: This allows you to perform pre-deployment tasks, such as
    database migrations or environment setup.
-   **Example**:
    ```yaml
    before: |
        api:./manage.py migrate
        api:./manage.py collectstatic --noinput
    ```

### `after`

-   **Description**: Commands to run after deployment, one per line in the
    `service:command` format.
-   **Required**: No
-   **Default**: "" (empty string)
-   **Rationale**: This allows you to perform post-deployment tasks, such as
    cache clearing or sending notifications.
-   **Example**:
    ```yaml
    after: |
        api:./manage.py clear_cache
        notifier:./send_deploy_notification.sh
    ```

By using these options, you can customize the deployment process to fit your
specific needs and infrastructure setup.
