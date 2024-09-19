import shlex
import sys
from pathlib import Path
from shutil import rmtree
from uuid import uuid4

import rich_click as click
import yaml
from rich.console import Console

from .config import Config
from .errors import ErrorForUser
from .ingress import ensure_network, start_ingress
from .reporting import action, handle_fatal, run_command, success

console = Console(force_terminal=True)


@click.command()
@click.option(
    "--before",
    multiple=True,
    help="Commands to run before deployment (format: service:command)",
)
@click.option(
    "--after",
    multiple=True,
    help="Commands to run after deployment (format: service:command)",
)
@click.option("--no-pull", is_flag=True, help="Do not pull images before deployment")
@click.argument("project_name")
@handle_fatal
def deploy(before: list[str], after: list[str], no_pull: bool, project_name: str):
    """Deploy a project using Docker Compose."""

    config = Config.instance()
    project_dir = config.project_dir(project_name)
    deploy_id = f"{uuid4()}"
    deploy_dir = project_dir / deploy_id

    ensure_network()

    with action(f"Creating new deployment for {project_name}"):
        deploy_dir.mkdir(parents=True, exist_ok=True)
        compose_content = _read_compose_file()
        compose_file = deploy_dir / "docker-compose.yml"
        compose_file.write_text(compose_content)

    if before:
        with action("Running before commands"):
            _run_service_commands(deploy_dir, before)

    with action("Deploying new version"):
        _deploy(deploy_dir, no_pull)

    with action("Stop old deployments"):
        old_deploys = [
            d for d in project_dir.iterdir() if d.is_dir() and d.name != deploy_id
        ]
        for old_deploy_dir in old_deploys:
            run_command(["docker", "compose", "down"], cwd=old_deploy_dir)
            rmtree(old_deploy_dir)

    with action("Ensure Traefik is started"):
        start_ingress()

    if after:
        with action("Running after commands"):
            _run_service_commands(deploy_dir, after)

    success(f"Deployment of {project_name} completed successfully.")


def _deploy(deploy_dir: Path, no_pull: bool):
    """
    Starts the deployment in Docker Compose

    Parameters
    ----------
    deploy_dir
        The directory where the deployment is located
    no_pull
        Whether to pull images before deployment
    """

    pull_flag = [] if no_pull else ["--pull", "always"]
    run_command(["docker", "compose", "up", "-d", *pull_flag], cwd=deploy_dir)


def _read_compose_file():
    """
    Reads the compose file from stdin and tries to guide the user into doing
    this.
    """

    if not (compose := sys.stdin.read()):
        msg = "The content of docker-compose.yml is expected on stdin."
        raise ErrorForUser(msg)

    try:
        yaml.safe_load(compose)
    except yaml.YAMLError as e:
        msg = f"Invalid docker-compose.yml: {e!s}"
        raise ErrorForUser(msg) from None

    return compose


def _run_service_commands(deploy_dir: Path, commands: list[str]):
    """
    Runs a series of one-off commands in the services of the deployment

    Parameters
    ----------
    deploy_dir
        The directory where the deployment is located
    commands
        A list of commands to run in the format <service>:<command>
    """

    for cmd in commands:
        match cmd.split(":", 1):
            case [service, command]:
                parts = shlex.split(command)
                run_command(
                    ["docker", "compose", "run", "-T", "--rm", service, *parts],
                    cwd=deploy_dir,
                )
            case _:
                msg = f"Invalid command format: {cmd}, expected <service>:<command>"
                raise ErrorForUser(msg)
