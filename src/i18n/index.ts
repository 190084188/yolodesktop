import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import common_zh from "./zh_CN/common.json";
import env_zh from "./zh_CN/env.json";
import dataset_zh from "./zh_CN/dataset.json";
import training_zh from "./zh_CN/training.json";
import export_zh from "./zh_CN/export.json";
import plugins_zh from "./zh_CN/plugins.json";
import settings_zh from "./zh_CN/settings.json";
import common_en from "./en_US/common.json";
import env_en from "./en_US/env.json";
import dataset_en from "./en_US/dataset.json";
import training_en from "./en_US/training.json";
import export_en from "./en_US/export.json";
import plugins_en from "./en_US/plugins.json";
import settings_en from "./en_US/settings.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh_CN: {
        common: common_zh, env: env_zh, dataset: dataset_zh,
        training: training_zh, export: export_zh, plugins: plugins_zh,
        settings: settings_zh,
      },
      en_US: {
        common: common_en, env: env_en, dataset: dataset_en,
        training: training_en, export: export_en, plugins: plugins_en,
        settings: settings_en,
      },
    },
    fallbackLng: "zh_CN",
    defaultNS: "common",
    detection: { order: ["navigator", "htmlTag"], caches: [] },
    interpolation: { escapeValue: false },
  });

export default i18n;
