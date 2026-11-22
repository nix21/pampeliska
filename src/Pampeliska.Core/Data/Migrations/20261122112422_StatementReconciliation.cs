using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class StatementReconciliation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "not_in_statement",
                table: "transactions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateOnly>(
                name: "period_from",
                table: "import_batches",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "period_to",
                table: "import_batches",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "reconciled_count",
                table: "import_batches",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "statement_covered_to",
                table: "accounts",
                type: "date",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "not_in_statement",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "period_from",
                table: "import_batches");

            migrationBuilder.DropColumn(
                name: "period_to",
                table: "import_batches");

            migrationBuilder.DropColumn(
                name: "reconciled_count",
                table: "import_batches");

            migrationBuilder.DropColumn(
                name: "statement_covered_to",
                table: "accounts");
        }
    }
}
