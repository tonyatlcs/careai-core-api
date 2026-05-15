import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { Documents } from "./documents.entity.js";

@Entity({ name: "document_text_blocks" })
@Unique("UQ_document_text_blocks_document_block", ["document", "blockId"])
@Index("IDX_document_text_blocks_document_id", ["document"])
export class DocumentTextBlocks {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Documents, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: Documents;

  @Column({ name: "block_id", type: "varchar", length: 128 })
  blockId!: string;

  @Column({ type: "int" })
  page!: number;

  @Column({ type: "text" })
  text!: string;

  @Column({ type: "double precision" })
  x!: number;

  @Column({ type: "double precision" })
  y!: number;

  @Column({ type: "double precision" })
  width!: number;

  @Column({ type: "double precision" })
  height!: number;

  @Column({ type: "double precision", nullable: true })
  confidence?: number | null;

  @Column({ type: "varchar", length: 32 })
  source!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
