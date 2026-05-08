import axios from "axios";
import dotenv from "dotenv";
import cron from "node-cron";
import { sessions, sendMessage } from "./app.js";

dotenv.config();

// -------------------------------
//  PING & FOLLOW-UP HELPERS
// -------------------------------
function getPingMessage(lang, topic) {
  if (lang === "tr") {
    return "Size daha iyi yardımcı olabilmem için, devam etmek istediğiniz bir konu var mı?";
  }
  if (lang === "ar") {
    return "هل تودون المتابعة في أي نقطة محددة؟";
  }
  return "Would you like to continue on any specific point?";
}

function getFollowUpMessage(lang, topic, stage) {
  const messages = {
    "3h": {
      general: {
        tr: "Merhaba. Bir süre önce yazışmıştık. İsterseniz kaldığımız yerden devam edebiliriz.",
        en: "Hello. We spoke a while ago. If you’d like, we can continue from where we left off.",
        ar: "مرحبًا. تحدثنا منذ فترة. إذا رغبتم، يمكننا المتابعة من حيث توقفنا."
      },
      company: {
        tr: "Merhaba. Şirket kuruluşu ile ilgili konuşmuştuk. Hazırsanız detayları netleştirebiliriz.",
        en: "Hello. We discussed company setup earlier. If you're ready, we can clarify the details.",
        ar: "مرحبًا. تحدثنا سابقًا عن تأسيس الشركة. إذا كنتم جاهزين، يمكننا توضيح التفاصيل."
      },
      residency: {
        tr: "Merhaba. Oturum süreciyle ilgili konuşmuştuk. Hazırsanız adımları netleştirebiliriz.",
        en: "Hello. We talked about residency. If you're ready, we can clarify the next steps.",
        ar: "مرحبًا. تحدثنا عن الإقامة. إذا كنتم جاهزين، يمكننا تحديد الخطوات التالية."
      },
      cost: {
        tr: "Merhaba. Maliyet ve bütçe ile ilgili konuşmuştuk. Hazırsanız sizin için en uygun yapıyı netleştirebiliriz.",
        en: "Hello. We discussed costs and budgeting. If you're ready, we can define the best structure for you.",
        ar: "مرحبًا. تحدثنا عن التكاليف والميزانية. إذا كنتم جاهزين، يمكننا تحديد الهيكل الأنسب لكم."
      },
      ai: {
        tr: "Merhaba. AI ve otomasyon çözümleriyle ilgili konuşmuştuk. Hazırsanız projenizi birlikte netleştirebiliriz.",
        en: "Hello. We discussed AI and automation solutions. If you're ready, we can refine your project together.",
        ar: "مرحبًا. تحدثنا عن حلول الذكاء الاصطناعي والأتمتة. إذا كنتم جاهزين، يمكننا تطوير مشروعكم معًا."
      }
    },

    "24h": {
      general: {
        tr: "Merhaba. Dün konuşmuştuk. Dubai ile ilgili planlarınız için hâlâ buradayım.",
        en: "Hello. We spoke yesterday. I’m still here to support your Dubai plans.",
        ar: "مرحبًا. تحدثنا بالأمس. ما زلت هنا لدعم خططكم في دبي."
      },
      company: {
        tr: "Merhaba. Dün şirket kuruluşu hakkında konuşmuştuk. Hazırsanız süreci başlatabiliriz.",
        en: "Hello. Yesterday we discussed company setup. If you're ready, we can start the process.",
        ar: "مرحبًا. تحدثنا أمس عن تأسيس الشركة. إذا كنتم جاهزين، يمكننا بدء الإجراءات."
      },
      residency: {
        tr: "Merhaba. Dün oturum süreci hakkında konuşmuştuk. Hazırsanız adımları netleştirebiliriz.",
        en: "Hello. Yesterday we talked about residency. If you're ready, we can clarify the steps.",
        ar: "مرحبًا. تحدثنا أمس عن الإقامة. إذا كنتم جاهزين، يمكننا تحديد الخطوات."
      },
      cost: {
        tr: "Merhaba. Dün bütçe ve maliyetler hakkında konuşmuştuk. Hazırsanız sizin için en uygun modeli belirleyebiliriz.",
        en: "Hello. Yesterday we discussed budget and costs. If you're ready, we can define the best model for you.",
        ar: "مرحبًا. تحدثنا أمس عن الميزانية والتكاليف. إذا كنتم جاهزين، يمكننا تحديد النموذج الأنسب لكم."
      },
      ai: {
        tr: "Merhaba. Dün AI projeniz hakkında konuşmuştuk. Hazırsanız bir sonraki adımı belirleyebiliriz.",
        en: "Hello. Yesterday we discussed your AI project. If you're ready, we can define the next step.",
        ar: "مرحبًا. تحدثنا أمس عن مشروع الذكاء الاصطناعي. إذا كنتم جاهزين، يمكننا تحديد الخطوة التالية."
      }
    },

    "48h": {
      general: {
        tr: "Merhaba. İki gündür iletişimde değiliz. Dubai planlarınız için hâlâ buradayım.",
        en: "Hello. We haven’t been in touch for two days. I’m still here for your Dubai plans.",
        ar: "مرحبًا. لم نتواصل منذ يومين. ما زلت هنا لدعم خططكم في دبي."
      },
      company: {
        tr: "Merhaba. Şirket kuruluşu ile ilgili iki gündür ilerleme olmadı. Hazırsanız süreci hızlandırabiliriz.",
        en: "Hello. There’s been no progress on company setup for two days. If you're ready, we can speed things up.",
        ar: "مرحبًا. لم يحدث تقدم في تأسيس الشركة منذ يومين. إذا كنتم جاهزين، يمكننا تسريع الإجراءات."
      },
      residency: {
        tr: "Merhaba. Oturum sürecinizle ilgili iki gündür ilerleme olmadı. Hazırsanız devam edebiliriz.",
        en: "Hello. There’s been no progress on your residency process for two days. If you're ready, we can continue.",
        ar: "مرحبًا. لم يحدث تقدم في عملية الإقامة منذ يومين. إذا كنتم جاهزين، يمكننا المتابعة."
      },
      cost: {
        tr: "Merhaba. Bütçe planlamanızla ilgili iki gündür iletişimde değiliz. Hazırsanız sizin için en uygun yapıyı netleştirebiliriz.",
        en: "Hello. We haven’t discussed your budgeting for two days. If you're ready, we can clarify the best structure.",
        ar: "مرحبًا. لم نناقش خطتكم المالية منذ يومين. إذا كنتم جاهزين، يمكننا تحديد الهيكل الأنسب لكم."
      },
      ai: {
        tr: "Merhaba. AI projenizle ilgili iki gündür ilerleme olmadı. Hazırsanız projeyi birlikte netleştirebiliriz.",
        en: "Hello. There’s been no progress on your AI project for two days. If you're ready, we can refine it together.",
        ar: "مرحبًا. لم يحدث تقدم في مشروع الذكاء الاصطناعي منذ يومين. إذا كنتم جاهزين، يمكننا تطويره معًا."
      }
    },

    "72h": {
      general: {
        tr: "Merhaba. Birkaç gündür iletişimde olmadığımızı fark ettim. Dubai’deki planlarınızın askıda kalmasını istemem. Hazırsanız, sizin için en doğru yolu birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t been in touch for a few days. I don’t want your Dubai plans to remain on hold. If you're ready, we can clarify the best path forward.",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ عدة أيام. لا أرغب أن تبقى خططكم في دبي معلّقة. إذا كنتم جاهزين، يمكننا تحديد المسار الأنسب لكم."
      },

      company: {
        tr: "Merhaba. Şirket kuruluşu planlarınızın birkaç gündür ilerlemediğini fark ettim. Dubai’de doğru yapı büyük fark yaratır. Hazırsanız, süreci birlikte hızlandırabiliriz.",
        en: "Hello. I noticed your company setup process hasn’t progressed in the last few days. The right structure in Dubai makes a major difference. If you're ready, we can move forward together.",
        ar: "مرحبًا. لاحظت أن عملية تأسيس الشركة لم تتقدم منذ عدة أيام. الهيكل الصحيح في دبي يحدث فرقًا كبيرًا. إذا كنتم جاهزين، يمكننا المتابعة معًا."
      },

      residency: {
        tr: "Merhaba. Oturum sürecinizin birkaç gündür ilerlemediğini fark ettim. Dubai’de oturum almak düşündüğünüzden daha hızlı tamamlanabilir. Hazırsanız, süreci netleştirebiliriz.",
        en: "Hello. I noticed your residency process hasn’t progressed for a few days. Residency in Dubai can be completed faster than expected. If you're ready, we can clarify the next steps.",
        ar: "مرحبًا. لاحظت أن عملية الإقامة لم تتقدم منذ عدة أيام. يمكن إنهاء الإقامة في دبي أسرع مما تتوقعون. إذا كنتم جاهزين، يمكننا تحديد الخطوات التالية."
      },

      cost: {
        tr: "Merhaba. Bütçe planlamanızın birkaç gündür askıda kaldığını fark ettim. Dubai’de maliyetleri doğru yönetmek önemli avantaj sağlar. Hazırsanız, sizin için en uygun yapıyı belirleyebiliriz.",
        en: "Hello. I noticed your budgeting process has been on hold for a few days. Managing costs correctly in Dubai provides major advantages. If you're ready, we can define the best structure for you.",
        ar: "مرحبًا. لاحظت أن خطتكم المالية معلّقة منذ عدة أيام. إدارة التكاليف بشكل صحيح في دبي يمنحكم مزايا كبيرة. إذا كنتم جاهزين، يمكننا تحديد الهيكل الأنسب لكم."
      },

      ai: {
        tr: "Merhaba. AI projenizin birkaç gündür ilerlemediğini fark ettim. Doğru otomasyon yapısı işinizi hızla ileri taşır. Hazırsanız, projenizi birlikte netleştirebiliriz.",
        en: "Hello. I noticed your AI project hasn’t progressed for a few days. The right automation structure accelerates your business significantly. If you're ready, we can refine your project together.",
        ar: "مرحبًا. لاحظت أن مشروع الذكاء الاصطناعي لم يتقدم منذ عدة أيام. الهيكل الصحيح للأتمتة يدفع عملكم بسرعة إلى الأمام. إذا كنتم جاهزين، يمكننا تطوير المشروع معًا."
      }
    },

    "7d": {
      general: {
        tr: "Merhaba. Bir haftadır iletişimde olmadığımızı fark ettim. Dubai ile ilgili planlarınız hâlâ geçerliyse, sizin için en doğru yolu birlikte belirleyebiliriz. Hazır olduğunuzda buradayım.",
        en: "Hello. I noticed we haven’t been in touch for a week. If your Dubai plans are still active, we can define the best path together. I’m here whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نتواصل منذ أسبوع. إذا كانت خططكم في دبي ما زالت قائمة، يمكننا تحديد المسار الأنسب لكم. أنا هنا متى ما كنتم جاهزين."
      },

      company: {
        tr: "Merhaba. Şirket kuruluşu planlarınızla ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de doğru yapı uzun vadeli avantaj sağlar. Hazır olduğunuzda süreci birlikte ilerletebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your company setup for a week. The right structure in Dubai provides long-term advantages. Whenever you're ready, we can move forward.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص تأسيس الشركة منذ أسبوع. الهيكل الصحيح في دبي يمنحكم مزايا طويلة المدى. أنا هنا متى ما كنتم جاهزين."
      },

      residency: {
        tr: "Merhaba. Oturum sürecinizle ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de oturum almak düşündüğünüzden daha hızlı ilerleyebilir. Hazır olduğunuzda devam edebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your residency process for a week. Residency in Dubai can progress faster than expected. We can continue whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص الإقامة منذ أسبوع. يمكن أن تتقدم الإقامة في دبي أسرع مما تتوقعون. أنا هنا متى ما كنتم جاهزين."
      },

      cost: {
        tr: "Merhaba. Bütçe planlamanızla ilgili bir haftadır iletişimde olmadığımızı fark ettim. Dubai’de maliyetleri doğru yönetmek önemli avantaj sağlar. Hazır olduğunuzda sizin için en uygun yapıyı belirleyebiliriz.",
        en: "Hello. I noticed we haven’t discussed your budgeting for a week. Managing costs correctly in Dubai provides major advantages. We can define the best structure whenever you're ready.",
        ar: "مرحبًا. لاحظت أننا لم نناقش خطتكم المالية منذ أسبوع. إدارة التكاليف بشكل صحيح في دبي يمنحكم مزايا كبيرة. أنا هنا متى ما كنتم جاهزين."
      },

      ai: {
        tr: "Merhaba. AI projenizle ilgili bir haftadır iletişimde olmadığımızı fark ettim. Doğru otomasyon yapısı işinizi hızla ileri taşır. Hazır olduğunuzda projenizi birlikte netleştirebiliriz.",
        en: "Hello. I noticed we haven’t followed up on your AI project for a week. The right automation structure can rapidly move your business forward. Whenever you're ready, we can refine your project.",
        ar: "مرحبًا. لاحظت أننا لم نتابع بخصوص مشروع الذكاء الاصطناعي منذ أسبوع. الهيكل الصحيح للأتمتة يمكن أن يدفع عملكم بسرعة إلى الأمام. أنا هنا متى ما كنتم جاهزين."
      }
    }
  };

  const stageSet = messages[stage];
  if (!stageSet) return "";

  const topicKey = topic && stageSet[topic] ? topic : "general";
  const topicSet = stageSet[topicKey];
  if (!topicSet) return "";

  return (
    topicSet[lang] ||
    topicSet["en"] ||
    topicSet["tr"] ||
    ""
  );
}

// -----------------------------------------------------
//  CRON TABANLI 10 DK PING + 3H + 24H + 48H + 72H + 7 GÜN
// -----------------------------------------------------
cron.schedule("*/10 * * * *", async () => {
  console.log("[CRON] Hatırlatma kontrolü tetiklendi:", new Date().toLocaleString());

  try {
    const now = Date.now();

    if (!sessions || typeof sessions !== "object") return;
    const users = Object.keys(sessions);
    if (!users.length) return;

    for (const user of users) {
      try {
        const s = sessions[user];
        if (!s || typeof s !== "object") continue;

        if (!s.firstMessageTime || isNaN(s.firstMessageTime)) {
          s.firstMessageTime = s.lastMessageTime || Date.now();
        }

        if (!s.lastMessageTime || isNaN(s.lastMessageTime)) continue;

        const diffMinutesLast = (now - s.lastMessageTime) / (1000 * 60);
        if (!isFinite(diffMinutesLast) || diffMinutesLast < 0) continue;

        const diffMinutes = (now - s.firstMessageTime) / (1000 * 60);
        const diffHours = diffMinutes / 60;

        const topics = Array.isArray(s.topics) ? s.topics : [];
        const lastTopic = topics.length ? topics[topics.length - 1] : "general";
        const lang = typeof s.lang === "string" ? s.lang : "en";

        if (typeof s.followUpStage !== "number") {
          s.followUpStage = 0;
        }

        // 10 DAKİKA PING — SADECE 1 KERE
        if (diffMinutesLast >= 10 && !s.pingSentOnce) {
          const pingMessage = getPingMessage(lang, lastTopic);

          if (pingMessage) {
            try {
              await sendMessage(user, pingMessage);
            } catch (e) {
              console.error("[CRON] sendMessage 10min error:", e);
            }
            s.pingSentOnce = true;
          }

          continue;
        }

        if (diffMinutesLast < 10 && s.pingSentOnce) {
          s.pingSentOnce = false;
        }

        // 3 SAAT FOLLOW-UP
        if (s.followUpStage === 0 && diffHours >= 3) {
          const msg = getFollowUpMessage(lang, lastTopic, "3h");

          if (msg) {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 3h error:", e);
            }
            s.followUpStage = 1;
          }

          continue;
        }

        // 24 SAAT FOLLOW-UP
        if (s.followUpStage === 1 && diffHours >= 24) {
          const msg = getFollowUpMessage(lang, lastTopic, "24h");

          if (msg) {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 24h error:", e);
            }
            s.followUpStage = 2;
          }

          continue;
        }

        // 48 SAAT FOLLOW-UP
        if (s.followUpStage === 2 && diffHours >= 48) {
          const msg = getFollowUpMessage(lang, lastTopic, "48h");

          if (msg) {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 48h error:", e);
            }
            s.followUpStage = 3;
          }

          continue;
        }

        // 72 SAAT FOLLOW-UP
        if (s.followUpStage === 3 && diffHours >= 72) {
          const msg = getFollowUpMessage(lang, lastTopic, "72h");

          if (msg) {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 72h error:", e);
            }
            s.followUpStage = 4;
          }

          continue;
        }

        // 7 GÜN FOLLOW-UP
        if (s.followUpStage === 4 && diffHours >= 168) {
          const msg = getFollowUpMessage(lang, lastTopic, "7d");

          if (msg) {
            try {
              await sendMessage(user, msg);
            } catch (e) {
              console.error("[CRON] sendMessage 7d error:", e);
            }
            s.followUpStage = 5;
          }

          continue;
        }

      } catch (err) {
        console.error("[CRON] User loop error:", err);
        continue;
      }
    }
  } catch (err) {
    console.error("[CRON] Genel hata:", err);
  }
});

console.log("SamChe Worker running (cron active)");
