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
