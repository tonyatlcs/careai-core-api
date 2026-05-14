import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDocumentExtractionsTable1780000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_extractions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL,
        "name" character varying(512) NOT NULL,
        "report_date" character varying(64) NOT NULL,
        "subject" text NOT NULL,
        "contact_source" text NOT NULL,
        "issue_user" text NOT NULL,
        "category" character varying(64) NOT NULL,
        "audit_text" text NOT NULL,
        "model" character varying(128) NOT NULL,
        "ocr_engine" character varying(64) NOT NULL,
        "raw_confidence" double precision,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_extractions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_extractions_document_id" UNIQUE ("document_id"),
        CONSTRAINT "FK_document_extractions_document_id" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "document_extractions"`);
  }
}
