import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDocumentTable1778725928592 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "document_type_enum" AS ENUM ('pdf', 'docx', 'jpg', 'png')`,
    );
    await queryRunner.query(
      `CREATE TYPE "document_processing_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed')`,
    );
    await queryRunner.query(`
      CREATE TABLE "documents" (
          "id" uuid NOT NULL DEFAULT gen_random_uuid(),
          "batch_id" uuid NOT NULL,
          "name" character varying(512) NOT NULL,
          "mime_type" character varying(255) NOT NULL,
          "type" "document_type_enum" NOT NULL,
          "byte_size" bigint NOT NULL,
          "status" "document_processing_status_enum" NOT NULL DEFAULT 'pending',
          "processing_error" text,
          "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "PK_documents_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TYPE "document_processing_status_enum"`);
    await queryRunner.query(`DROP TYPE "document_type_enum"`);
  }
}
