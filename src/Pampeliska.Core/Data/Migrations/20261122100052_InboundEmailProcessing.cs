using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class InboundEmailProcessing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "inbound_email_id",
                table: "transactions",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "provisional",
                table: "transactions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "attempts",
                table: "inbound_emails",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "dkim_domain",
                table: "inbound_emails",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "extracted_json",
                table: "inbound_emails",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "note",
                table: "inbound_emails",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "processed_at",
                table: "inbound_emails",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "card_suffixes",
                table: "accounts",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");

            migrationBuilder.CreateTable(
                name: "inbound_senders",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    domain = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    name = table.Column<string>(type: "text", nullable: true),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inbound_senders", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transactions_inbound_email_id",
                table: "transactions",
                column: "inbound_email_id");

            migrationBuilder.CreateIndex(
                name: "ix_inbound_senders_domain",
                table: "inbound_senders",
                column: "domain",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbound_senders");

            migrationBuilder.DropIndex(
                name: "ix_transactions_inbound_email_id",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "inbound_email_id",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "provisional",
                table: "transactions");

            migrationBuilder.DropColumn(
                name: "attempts",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "dkim_domain",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "extracted_json",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "note",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "processed_at",
                table: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "card_suffixes",
                table: "accounts");
        }
    }
}
