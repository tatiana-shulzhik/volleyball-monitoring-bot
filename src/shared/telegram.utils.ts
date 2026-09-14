import { Context, Markup } from 'telegraf';

export function isTelegramMenuCommand(context: Context): boolean {
  const text =
    context.message && 'text' in context.message
      ? context.message.text
      : undefined;

  return /^\/(?:start|menu)(?:@\w+)?(?:\s|$)/i.test(text ?? '');
}

export async function editTelegramRichMessage(
  context: Context,
  html: string,
  keyboard: ReturnType<typeof Markup.inlineKeyboard>,
): Promise<void> {
  const message = context.callbackQuery?.message;
  if (!message) return;

  const editRichMessage = context.telegram.callApi.bind(
    context.telegram,
  ) as unknown as (
    method: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;

  await editRichMessage('editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    rich_message: { html },
    reply_markup: keyboard.reply_markup,
  });
}

export async function sendTelegramRichMessage(
  context: Context,
  html: string,
): Promise<void> {
  const chatId = context.chat?.id;
  if (chatId === undefined) return;

  const sendRichMessage = context.telegram.callApi.bind(
    context.telegram,
  ) as unknown as (
    method: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;

  await sendRichMessage('sendRichMessage', {
    chat_id: chatId,
    rich_message: { html },
  });
}
