import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

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
export class Document {
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

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
