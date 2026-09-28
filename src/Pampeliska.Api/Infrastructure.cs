using Pampeliska.Core.Domain;

namespace Pampeliska.Api;

/// <summary>Doménové chyby vrací jako 400 s českou hláškou.</summary>
public class DomainExceptionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (DomainException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
            await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
        }
        catch (BadHttpRequestException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = ex.StatusCode;
            await ctx.Response.WriteAsJsonAsync(new { error = "Neplatný požadavek: " + (ex.InnerException?.Message ?? ex.Message) });
        }
        catch (HttpRequestException ex) when (!ctx.Response.HasStarted)
        {
            ctx.Response.StatusCode = StatusCodes.Status502BadGateway;
            await ctx.Response.WriteAsJsonAsync(new { error = $"Externí služba je nedostupná: {ex.Message}" });
        }
    }
}
