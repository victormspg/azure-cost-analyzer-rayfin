"""Azure Functions v2 entry point.

The Python v2 programming model discovers functions from a top-level
`function_app.py`. Per this feature's spec, the actual HTTP handling lives
in `handler.py` and the Data Agent invocation logic lives in `invoker.py`;
this file just registers handler.py's Blueprint so the Functions host can
find it.
"""

import azure.functions as func

from handler import bp

app = func.FunctionApp()
app.register_functions(bp)
