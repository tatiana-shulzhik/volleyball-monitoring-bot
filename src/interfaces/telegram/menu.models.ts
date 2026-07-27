export interface MenuItem {
  text: string;
  callbackData: string;
}

export interface ListMenu {
  items: MenuItem[];
  message: string;
  emptyMessage: string;
  backText: string;
  backCallbackData: string;
}
