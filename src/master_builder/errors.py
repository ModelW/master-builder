class MasterBuilderError(Exception):
    pass


class ErrorForUser(MasterBuilderError):
    """An error intended to be displayed to the user"""
