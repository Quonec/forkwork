class GameError(Exception):
    """A request the game refuses (bad input or wrong state). Maps to HTTP 400."""
