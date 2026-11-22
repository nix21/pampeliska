using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class InboundEmails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "inbound_email_token",
                table: "households",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "inbound_emails",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    source = table.Column<int>(type: "integer", nullable: false),
                    remote_ip = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    envelope_from = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    envelope_to = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    from_name = table.Column<string>(type: "text", nullable: true),
                    from_address = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    subject = table.Column<string>(type: "text", nullable: true),
                    message_id = table.Column<string>(type: "character varying(998)", maxLength: 998, nullable: true),
                    sent_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    text_body = table.Column<string>(type: "text", nullable: true),
                    preview = table.Column<string>(type: "text", nullable: true),
                    size_bytes = table.Column<int>(type: "integer", nullable: false),
                    attachment_count = table.Column<int>(type: "integer", nullable: false),
                    raw_mime = table.Column<byte[]>(type: "bytea", nullable: true),
                    raw_purged_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    state = table.Column<int>(type: "integer", nullable: false),
                    error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_inbound_emails", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_inbound_emails_message_id",
                table: "inbound_emails",
                column: "message_id");

            migrationBuilder.CreateIndex(
                name: "ix_inbound_emails_received_at",
                table: "inbound_emails",
                column: "received_at");

            migrationBuilder.CreateIndex(
                name: "ix_inbound_emails_state",
                table: "inbound_emails",
                column: "state");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "inbound_emails");

            migrationBuilder.DropColumn(
                name: "inbound_email_token",
                table: "households");
        }
    }
}
