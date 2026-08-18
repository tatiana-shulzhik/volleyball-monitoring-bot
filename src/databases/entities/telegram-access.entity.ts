import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'telegram_access' })
export class TelegramAccessEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;
}
