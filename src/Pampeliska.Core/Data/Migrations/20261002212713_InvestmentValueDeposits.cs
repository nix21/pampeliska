using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class InvestmentValueDeposits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "deposits",
                table: "investment_values",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deposits",
                table: "investment_values");
        }
    }
}
