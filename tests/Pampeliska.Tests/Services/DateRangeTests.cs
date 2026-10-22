using Pampeliska.Core;

namespace Pampeliska.Tests.Services;

public class DateRangeTests
{
    [Theory]
    [InlineData("2026-09", "2026-08-01..2026-08-31")]
    [InlineData("2026-Q1", "2025-10-01..2025-12-31")]
    [InlineData("2026", "2025-01-01..2025-12-31")]
    // Plovoucí rok → předchozích 12 měsíců
    [InlineData("2025-10-01..2026-09-30", "2024-10-01..2025-09-30")]
    // Od ledna do konce minulého měsíce → stejné měsíce loni
    [InlineData("2026-01-01..2026-09-30", "2025-01-01..2025-09-30")]
    [InlineData("2028-01-01..2028-02-29", "2027-01-01..2027-02-28")]
    [InlineData("2026-04-01..2026-09-30", "2025-10-01..2026-03-31")]
    [InlineData("2026-09-10..2026-09-19", "2026-08-31..2026-09-09")]
    public void Previous_period(string period, string expected) =>
        Assert.Equal(expected, DateRange.Parse(period).Previous().ToString());
}
