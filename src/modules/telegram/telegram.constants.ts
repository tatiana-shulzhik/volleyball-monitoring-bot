import { ECompetitionType, ESourceCode } from '../../shared/enums';

export const COMPETITION_TYPE_BUTTONS: Record<ECompetitionType, string> = {
  [ECompetitionType.Club]: '🏐 Клубные',
  [ECompetitionType.NationalTeam]: '🌍 Сборные',
};

export const MENU_BUTTONS = [
  '📊 Статистика',
  '🗓 Ретро статистика',
  '🔎 Мониторинг',
  '📋 Текущий мониторинг',
  '🔴 Лайв',
] as const;

export const SOURCE_BUTTONS: Record<ESourceCode, string> = {
  [ESourceCode.Cev]: '🇪🇺 CEV',
  [ESourceCode.LegaVolley]: '🇮🇹 Lega Volley',
  [ESourceCode.LegaVolleyFemminile]: '🇮🇹 Lega Volley Femminile',
};

export const TELEGRAM_MESSAGES = {
  sources: {
    select: 'Выберите источник:',
  },
  competitionTypes: {
    select: 'Выберите вид соревнований:',
  },
  seasons: {
    select: 'Выберите сезон:',
    empty: 'Актуальный сезон не найден.',
  },
  championships: {
    select: 'Выберите чемпионат:',
    empty: 'Для выбранного сезона чемпионаты не найдены.',
  },
  stages: {
    select: 'Выберите этап соревнования:',
    empty: 'Для выбранного соревнования этапы не найдены.',
  },
  teams: {
    select: 'Выберите команду:',
    empty: 'Для выбранного этапа команды не найдены.',
    statisticsEmpty: 'Для выбранной команды игроки не найдены.',
    back: '⬅️ К командам',
  },
  inDevelopment: 'Раздел находится в разработке 🛠',
  access: {
    denied: 'Доступ к боту запрещён.',
  },
  error: 'Не удалось загрузить данные. Попробуйте позже.',
} as const;
