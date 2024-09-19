# Master Builder

Deploy and manage your applications on a single VM with Docker Compose. The job
of Master Builder is to run blue/green deployments of your app and make sure
that the ingress is running.

## Quick start

First, make sure that all the prerequisites are set:

-   Ports 80 and 443 must be authorized in the firewall
-   The server must have Docker and Docker Compose installed (Docker Engine
    20.10.13+)
-   The server must have Python 3.10+ installed

To get started, just install Master Builder with `pip` (requires Python 3.10+):

```
pip install master-builder
```

> **Note** &mdash; If you intend on using a virtual environment for this, make
> sure to adapt all the commands listed here.

After this, there is a small phase of initialization, so that you can give the
email to be used for Let's Encrypt certificates:

```bash
master-builder init --enable-https --ssl-contact you@yourdomain.com
```

Then you can deploy a project, for example from GitHub Actions:

```bash
cat docker-compose.yml | ssh user@your-host.com master-builder deploy my-project
```

This will deploy the project to the server and start the Traefik ingress.

Let's break down the components of this command:

-   `cat docker-compose.yml` &mdash; This reads the `docker-compose.yml` file
    and pipes it to the `master-builder` command (through SSH, more on that
    later). Of course you can pipe it any way you want, as long as the content
    lands on the command's stdin.
-   `ssh user@your-host.com` &mdash; Here I suppose that you are deploying to a
    remote server, from a GitHub action for example. I'm skipping the private
    key configuration, but you can store it in the GHA secrets. Use whatever is
    convenient, or don't even use SSH if you don't want to.
-   `master-builder deploy my-project` &mdash; This is the command that will
    deploy the project. The `my-project` argument is the name of the project
    that you are deploying. This is used to identify the project in the
    configuration. You can have as many projects as you want and they will be
    automatically created when you deploy them.

What happens during a deploy is the following:

1. A new working directory is created for this project, in
   `$MB_HOME/my-project/<deploy-id>` (the default value of `$MB_HOME` is
   `$HOME/.master-builder`)
2. The `docker-compose.yml` file is copied to this directory
3. The Traefik ingress is started, if it's not already running. At this point
   the traffic starts flowing to the new deployment
4. A `docker compose up -d` is run in this directory &mdash; with the `--pull`
   flag by default, otherwise use `deploy --no-pull` to avoid pulling the images
5. Master Builder waits for all the services to come up successfully
6. If there is an old deployment for this project, it is shut down

## Private Docker registry

If you are using a private Docker registry, it's up to you to `docker login`
into it.

## Docker Compose structure

The Docker Compose file is structured exactly as you want, Master Builder will
keep it verbatim. You must however respect some conventions.

The most important is that `Traefik` will discover your services through the use
of [Docker labels](https://doc.traefik.io/traefik/routing/providers/docker/). As
such you need to have the proper labels on your services.

For `Traefik` to be able to reach your service, you will also have to put the
services into the `traefik` network.

And finally, if you want your service to be restarted automatically, including
when the server gets restarted, then don't forget to say `restart: always`.

For example:

```yaml
services:
    my-service:
        image: my-service:latest
        restart: always
        networks:
            - traefik
        labels:
            - "traefik.enable=true"
            - "traefik.http.routers.my-service.rule=Host(`my-service.com`)"
            - "traefik.http.routers.my-service.entrypoints=websecure"
            - "traefik.http.routers.my-service.tls.certresolver=masterBuilder"
```

## Deployment commands

You can have Master Builder run commands before and after the deployment, in the
context of services defined in the `docker-compose.yml` file.

For example, you can run migrations before starting the services:

```bash
cat docker-compose.yml | ssh user@your-host.com master-builder \
  --before api:"./manage.py migrate" \
  --after slack:"send-notif" \
  deploy \
  my-project
```

## Docker Compose passthrough

If you want, you can directly use the Docker Compose commands for each project
using the `compose` sub-command. For example:

```bash
master-builder compose my-project -- logs -f
```

This gets translated, running in the deployment's folder, into:

```bash
docker compose logs -f
```

## Ingress

Master Builder uses Traefik as the ingress. It gets started automatically at the
first deployment, however you can also start it manually:

```bash
master-builder ingress start
```

And stop it:

```bash
master-builder ingress stop
```

Another thing is the update of the ingress container. By default, Treafik runs
forever with the same image without getting updated. However if you want to
update it (for reasons of bugs or security), you can do so with:

```bash
master-builder ingress update
```

> **Note** &mdash; This will pull the newest Traefik image and if the ingress is
> started it will be restarted.

## Usage with GitHub Actions

The goal is to make it easy to deploy from GitHub Actions, as well as help you
running the project locally if you want.

All is based up on the `docker-compose.yml` file at the root of your repo. It
will get automatically transformed in the following way:

-   Instead of building the images, it will expect to find them in the registry
    (more on that later)
-   Each `.env` file will be fed from the GitHub secrets and inserted into the
    compose file (which is due to the way our deployments work)
-   Volumes are not supported, so if you have volumes expect failure
-   All services will be added to the `traefik` network automatically

The general idea is to have a `docker-compose.yml` that serves as a base to
declare all non-persistent services and then potentially have a
`docker-compose.override.yml` to setup your local environment from that base.

Then you can create a GHA workflow that looks like this:

```yaml
name: Master Builder Deployment

on:
    push:
        branches:
            - production
            - staging
    workflow_dispatch:

jobs:
    prepare:
        name: Prepare
        runs-on: ubuntu-latest
        outputs:
            services: ${{ steps.set-services.outputs.services }}
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Get services from docker-compose
              id: set-services
              run: |
                  services=$(docker compose -f docker-compose.yml config --format json | jq -c --arg cwd "$PWD" '[.services | to_entries[] | select(.value.build) | {
                    name: .key,
                    context: (.value.build.context | if startswith($cwd + "/") then sub("^" + $cwd + "/"; "") else . end),
                    dockerfile: .value.build.dockerfile
                  }] | unique_by(.context | split("/") | last)')
                  echo "services=$services" >> $GITHUB_OUTPUT

    build:
        name: Build ${{ matrix.service.name }}
        runs-on: ubuntu-latest
        needs: prepare
        strategy:
            matrix:
                service: ${{ fromJson(needs.prepare.outputs.services) }}
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Set up Docker Buildx
              uses: docker/setup-buildx-action@v3

            - name: Login to Private Docker Registry
              uses: docker/login-action@v3
              with:
                  registry: <your-registry>
                  username: ${{ secrets.REGISTRY_USERNAME }}
                  password: ${{ secrets.REGISTRY_PASSWORD }}

            - name: Downcase REPO
              run: |
                  echo "REPO=${GITHUB_REPOSITORY,,}" >>${GITHUB_ENV}

            - name: Build and push
              uses: docker/build-push-action@v6
              with:
                  context: "${{ matrix.service.context }}"
                  file:
                      "${{ matrix.service.context }}/${{
                      matrix.service.dockerfile }}"
                  push: true
                  tags: |
                      <your-registry>/${{ env.REPO }}-${{ matrix.service.name }}:${{ github.ref_name }}
                      <your-registry>/${{ env.REPO }}-${{ matrix.service.name }}:${{ github.sha }}

    deploy:
        name: Deploy
        runs-on: bob
        needs: build
        steps:
            - name: Checkout
              uses: actions/checkout@v4

            - name: Pre-compute values
              run: |
                  BRANCH_NAME=${GITHUB_REF##*/}
                  BRANCH_NAME_UPPERCASE=${BRANCH_NAME^^}
                  echo "BRANCH_NAME=${BRANCH_NAME}" >> $GITHUB_ENV
                  echo "BRANCH_NAME_UPPERCASE=${BRANCH_NAME_UPPERCASE}" >> $GITHUB_ENV
                  echo "REPO=${GITHUB_REPOSITORY,,}" >> $GITHUB_ENV

            - name: Getting Docker Compose
              run:
                  "sudo apt-get update && sudo apt-get install -y docker-compose"

            - name: Deploy using Master Builder
              uses: modelw/master-builder@develop
              with:
                  image_tpl:
                      "<your-registry>/${{ env.REPO }}-{{ .service.name }}:${{
                      github.sha }}"
                  env:
                      "${{ secrets[format('ENV_{0}', env.BRANCH_NAME_UPPERCASE)]
                      }}"
                  ssh_url:
                      "${{ vars[format('SSH_URL_{0}',
                      env.BRANCH_NAME_UPPERCASE)] }}"
                  ssh_private_key: "${{ secrets.SSH_PRIVATE_KEY }}"
                  before: "api:modelw-docker run ./manage.py migrate"
```

See the [action documentation](action/README.md) for more details.
