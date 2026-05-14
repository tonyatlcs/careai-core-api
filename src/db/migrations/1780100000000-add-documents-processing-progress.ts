import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentsProcessingProgress1780100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents"
      ADD COLUMN "processing_progress" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documents" DROP COLUMN "processing_progress"
    `);
  }
}
