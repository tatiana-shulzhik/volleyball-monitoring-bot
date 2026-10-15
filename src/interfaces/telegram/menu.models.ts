export interface MenuItem {
  text: string;
  callbackData: string;
  secondary?: MenuItem;
}

export interface ListMenu {
  items: MenuItem[];
  message: string;
  emptyMessage: string;
  backText: string;
  backCallbackData: string;
  answerText?: string;
}
