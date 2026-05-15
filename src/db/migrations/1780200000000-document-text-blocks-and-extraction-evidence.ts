import { MigrationInterface, QueryRunner } from "typeorm";

export class DocumentTextBlocksAndExtractionEvidence1780200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_text_blocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL,
        "block_id" character varying(128) NOT NULL,
        "page" integer NOT NULL,
        "text" text NOT NULL,
        "x" double precision NOT NULL,
        "y" double precision NOT NULL,
        "width" double precision NOT NULL,
        "height" double precision NOT NULL,
        "confidence" double precision,
        "source" character varying(32) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_document_text_blocks_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_text_blocks_document_block" UNIQUE ("document_id", "block_id"),
        CONSTRAINT "FK_document_text_blocks_document_id" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_document_text_blocks_document_id" ON "document_text_blocks" ("document_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "document_extractions"
      ADD COLUMN "evidence" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_extractions" DROP COLUMN "evidence"
    `);
    await queryRunner.query(`DROP INDEX "IDX_document_text_blocks_document_id"`);
    await queryRunner.query(`DROP TABLE "document_text_blocks"`);
  }
}
