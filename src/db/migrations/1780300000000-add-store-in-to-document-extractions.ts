import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStoreInToDocumentExtractions1780300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "document_extractions"
      ADD COLUMN "store_in" character varying(32) NOT NULL DEFAULT 'Correspondence'
    `);
    await queryRunner.query(`
      UPDATE "document_extractions"
      SET "evidence" = jsonb_set("evidence", '{storeIn}', '[]'::jsonb, true)
      WHERE "evidence" IS NOT NULL
        AND NOT ("evidence" ? 'storeIn')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "document_extractions"
      SET "evidence" = "evidence" - 'storeIn'
      WHERE "evidence" IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "document_extractions" DROP COLUMN "store_in"
    `);
  }
}
