import re

import rich_click as click

from .config import Config, PersistedConfig
from .errors import ErrorForUser
from .reporting import handle_fatal, success


def validate_email(email):
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    if re.match(pattern, email):
        local_part, domain = email.rsplit("@", 1)

        if len(email) > 254:
            return False
        if len(local_part) > 64:
            return False
        if domain.startswith(".") or domain.endswith("."):
            return False
        if ".." in domain:
            return False

        return True
    else:
        return False


@click.command()
@click.option(
    "--ssl-contact",
    help="Email address for the SSL certificate contact",
)
@click.option(
    "--enable-https",
    is_flag=True,
    help="Enable HTTPS for the project. If yes, --ssl-contact is required.",
)
@handle_fatal
def init(ssl_contact: str, enable_https: bool):
    """Registers static values that are required for the project to work."""

    config = Config.instance(no_init_required=True)

    if enable_https:
        if not ssl_contact:
            msg = (
                "If you want to enable HTTPS, you need to provide an email "
                "address for the SSL certificate contact."
            )
            raise ErrorForUser(msg)

        if not validate_email(ssl_contact):
            msg = f"Invalid email address: {ssl_contact!r}."
            raise ErrorForUser(msg)

    config.persisted = PersistedConfig(
        init_done=True,
        enable_https=enable_https,
        ssl_contact=ssl_contact,
    )

    success("Initialization done.")
