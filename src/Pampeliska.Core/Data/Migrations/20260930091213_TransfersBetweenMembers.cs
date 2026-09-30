using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class TransfersBetweenMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "between_members",
                table: "transactions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "transfer_account_id",
                table: "transactions",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "between_members",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "transfer_account_id",
                table: "transactions");
        }
    }
}
