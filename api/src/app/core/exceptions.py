from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.common.envelope import ApiEnvelope, ApiError, ApiMetadata
from app.core.request_context import request_id_ctx


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(
            code="forbidden",
            message=message,
            status_code=403,
        )


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Unauthorized") -> None:
        super().__init__(
            code="unauthorized",
            message=message,
            status_code=401,
        )


def _envelope_error(
    code: str,
    message: str,
    details: dict | None = None,
) -> dict:
    envelope = ApiEnvelope[None](
        data=None,
        error=ApiError(code=code, message=message, details=details),
        metadata=ApiMetadata(request_id=request_id_ctx.get()),
        pagination=None,
    )
    return envelope.model_dump(mode="json")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope_error(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        _request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        code = "http_error"
        if exc.status_code == 404:
            code = "not_found"
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope_error(code, str(exc.detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_envelope_error(
                "validation_error",
                "Request validation failed",
                details={"errors": exc.errors()},
            ),
        )
