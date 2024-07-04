import rich_click as click
from rich.console import Console

from .config import Config
from .reporting import action, handle_fatal, run_command, success

console = Console()


TRAEFIK_COMPOSE_HTTP = """---
services:
  traefik:
    image: traefik:v2.9
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.localhost`)"
      - "traefik.http.routers.traefik.service=api@internal"

networks:
  default:
    name: traefik
    external: true
"""


TRAEFIK_COMPOSE_HTTPS = """---
services:
  traefik:
    image: traefik:v2.9
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
      - "--certificatesresolvers.masterBuilder.acme.tlschallenge=true"
      - "--certificatesresolvers.masterBuilder.acme.email={ssl_contact}"
      - "--certificatesresolvers.masterBuilder.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "{letsencrypt_dir}:/letsencrypt"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.traefik.rule=Host(`traefik.localhost`)"
      - "traefik.http.routers.traefik.service=api@internal"

networks:
  default:
    name: traefik
    external: true
"""


def generate_compose() -> str:
    config = Config.instance()
    persisted = config.persisted

    config.letsencrypt_dir.mkdir(parents=True, exist_ok=True)

    if persisted.enable_https:
        return TRAEFIK_COMPOSE_HTTPS.format(
            ssl_contact=persisted.ssl_contact,
            letsencrypt_dir=config.letsencrypt_dir,
        )
    else:
        return TRAEFIK_COMPOSE_HTTP


def ensure_traefik_compose():
    """Ensure that the Traefik Docker Compose file exists."""

    config = Config.instance()

    ingress_dir = config.ingress_dir
    ingress_dir.mkdir(parents=True, exist_ok=True)

    compose_file = ingress_dir / "docker-compose.yml"
    existing_content = ""

    if compose_file.exists():
        existing_content = compose_file.read_text()

    expected_content = generate_compose()

    if existing_content != expected_content:
        verb = "Updating" if compose_file.exists() else "Creating"

        with action(f"{verb} Traefik Docker Compose file"):
            compose_file.write_text(expected_content)


def is_running() -> bool:
    """
    Check if the Traefik ingress is running.
    """

    ingress_dir = Config.instance().ingress_dir
    ensure_traefik_compose()

    result = run_command(
        ["docker", "compose", "ps", "--services", "--filter", "status=running"],
        cwd=ingress_dir,
        check=False,
        capture=True,
        quiet=True,
    )

    return "traefik" in result.stdout


def ensure_network() -> None:
    """
    Ensures that the network for Traefik exists.
    """

    exists = (
        run_command(
            ["docker", "network", "ls", "--format", "{{.Name}}"],
            check=False,
            capture=True,
            quiet=True,
        )
        .stdout.strip()
        .split("\n")
    )

    if "traefik" not in exists:
        with action("Creating Traefik network"):
            run_command(["docker", "network", "create", "traefik"])


def start_ingress():
    """
    Start the Traefik ingress. This function is idempotent.
    """

    ingress_dir = Config.instance().ingress_dir
    ensure_traefik_compose()
    ensure_network()

    if not is_running():
        with action("Starting Traefik ingress"):
            run_command(["docker", "compose", "up", "-d"], cwd=ingress_dir)


def stop_ingress():
    """
    Stop the Traefik ingress. This function is idempotent.
    """

    ingress_dir = Config.instance().ingress_dir
    ensure_traefik_compose()

    if is_running():
        with action("Stopping Traefik ingress"):
            run_command(["docker", "compose", "down"], cwd=ingress_dir)


@click.group()
def ingress():
    """Manage the Traefik ingress."""
    pass


@ingress.command()
@handle_fatal
def start():
    """Start the Traefik ingress."""

    if is_running():
        success("Traefik ingress is already running.")
    else:
        start_ingress()
        success("Traefik ingress started successfully.")


@ingress.command()
@handle_fatal
def stop():
    """Stop the Traefik ingress."""

    if is_running():
        stop_ingress()
        success("Traefik ingress stopped successfully.")
    else:
        success("Traefik ingress is not running.")


@ingress.command()
@handle_fatal
def update():
    """Update the Traefik ingress."""

    ingress_dir = Config.instance().ingress_dir
    ensure_traefik_compose()

    with action("Pulling latest Traefik image"):
        run_command(["docker", "compose", "pull"], cwd=ingress_dir)

    if is_running():
        stop_ingress()
        start_ingress()

    success("Traefik ingress updated successfully.")


@ingress.command()
@handle_fatal
def status():
    """Check the status of the Traefik ingress."""

    if is_running():
        s = "[green]running[/green]"
    else:
        s = "[red]not running[/red]"

    console.print(f"Traefik status: {s}")
