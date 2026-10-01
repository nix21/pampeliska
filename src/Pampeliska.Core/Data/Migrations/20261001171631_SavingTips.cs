using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Pampeliska.Core.Data.Migrations
{
    /// <inheritdoc />
    public partial class SavingTips : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "saving_tips",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    body = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    topic = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    monthly_saving = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: false),
                    saving_label = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    evidence = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    transaction_ids = table.Column<string>(type: "text", nullable: true),
                    search = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    member_id = table.Column<int>(type: "integer", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    since = table.Column<DateOnly>(type: "date", nullable: false),
                    created_by = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_saving_tips", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "saving_tips");
        }
    }
}
