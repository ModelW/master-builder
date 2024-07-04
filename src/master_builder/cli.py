import rich_click as click

from . import __version__
from .compose import compose
from .deploy import deploy
from .ingress import ingress
from .init import init


@click.group()
@click.version_option(version=__version__)
def cli():
    """
    Master Builder: Deploy and manage your applications on a single VM with
    Docker Compose.
    """


cli.add_command(deploy)
cli.add_command(ingress)
cli.add_command(compose)
cli.add_command(init)


if __name__ == "__main__":
    cli()
