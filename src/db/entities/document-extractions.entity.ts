import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { Documents } from "./documents.entity.js";

@Entity({ name: "document_extractions" })
export class DocumentExtractions {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToOne(() => Documents, (document) => document.extraction, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "document_id" })
  document!: Documents;

  @Column({ type: "varchar", length: 512 })
  name!: string;

  @Column({ name: "report_date", type: "varchar", length: 64 })
  reportDate!: string;

  @Column({ type: "text" })
  subject!: string;

  @Column({ name: "contact_source", type: "text" })
  contactSource!: string;

  @Column({ name: "issue_user", type: "text" })
  issueUser!: string;

  @Column({ type: "varchar", length: 64 })
  category!: string;

  @Column({ name: "audit_text", type: "text" })
  auditText!: string;

  @Column({ type: "varchar", length: 128 })
  model!: string;

  @Column({ name: "ocr_engine", type: "varchar", length: 64 })
  ocrEngine!: string;

  @Column({
    name: "raw_confidence",
    type: "double precision",
    nullable: true,
  })
  rawConfidence?: number | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
