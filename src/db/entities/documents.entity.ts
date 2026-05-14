import type { Relation } from "typeorm";
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import type { DocumentExtractions } from "./document-extractions.entity.js";

export enum DocumentMimeKind {
  PDF = "pdf",
  DOCX = "docx",
  JPG = "jpg",
  PNG = "png",
}

export enum DocumentProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

@Entity({ name: "documents" })
export class Documents {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "batch_id", type: "uuid" })
  batchId!: string;

  @Column({ type: "varchar", length: 512 })
  name!: string;

  @Column({ name: "mime_type", type: "varchar", length: 255 })
  mimeType!: string;

  @Column({
    type: "enum",
    enum: DocumentMimeKind,
    enumName: "document_type_enum",
  })
  type!: DocumentMimeKind;

  @Column({ name: "byte_size", type: "bigint" })
  byteSize!: string;

  @Column({
    type: "enum",
    enum: DocumentProcessingStatus,
    enumName: "document_processing_status_enum",
    default: DocumentProcessingStatus.PENDING,
  })
  status!: DocumentProcessingStatus;

  @Column({ name: "processing_error", type: "text", nullable: true })
  processingError?: string | null;

  /** 0–100; source of truth for list `progress` while processing or after failure. */
  @Column({ name: "processing_progress", type: "int", default: 0 })
  processingProgress!: number;

  @OneToOne(
    "DocumentExtractions",
    (extraction: { document: Documents }) => extraction.document,
  )
  extraction?: Relation<DocumentExtractions> | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
