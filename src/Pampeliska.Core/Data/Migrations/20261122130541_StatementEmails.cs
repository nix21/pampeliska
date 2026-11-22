using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class StatementEmails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "statement_json",
                table: "inbound_emails",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "statement_result_json",
                table: "inbound_emails",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "statement_passwords",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    protected_value = table.Column<string>(type: "text", nullable: false),
                    sender_domain = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                    last_used_domain = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: true),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_statement_passwords", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "statement_passwords");

            migrationBuilder.DropColumn(
                name: "statement_json",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "statement_result_json",
                table: "inbound_emails");
        }
    }
}
