// ==========================================
// 1. الإعدادات الأساسية لوكيل الأوردرات (ai provider)
// ==========================================
const GEMINI_API_KEY = "AQ.Ab8RN6LJOBV2bsfAEslirCrj7k3ylALJCsFBmL3w4IJnL5TPnA";
const MODEL_NAME = "gemini-2.0-flash";
const MAX_FREE_QUESTIONS = 3;
const WHATSAPP_NUMBER = "970567375571";
const ACTIVATION_CODE = "AIPR-PRO";

const PRODUCTS_AND_POLICY = `
- الصنف 1: قهوة مختارة — السعر: حسب الاختيار والوزن المعتمد عند تأكيد الطلب — الميزة: نكهة غنية وقوام متوازن مناسب للتحضير اليومي والضيافة.
- الصنف 2: تمور فاخرة — السعر: حسب الصنف والوزن المعتمد عند تأكيد الطلب — الميزة: حبات مختارة بعناية وجودة عالية مناسبة للضيافة والاستهلاك اليومي.
- الصنف 3: ساعات — السعر: حسب الموديل المعتمد عند تأكيد الطلب — الميزة: تصميم عملي أنيق مناسب للاستخدام اليومي والإهداء.
- التوصيل: يتم التنسيق وتأكيد مدة وتكلفة التوصيل حسب العنوان والمنطقة عند إتمام الطلب.
- الدفع: يتم تأكيد آلية الدفع المناسبة مع العميل عند اعتماد الأوردر.
`;

const SYSTEM_PROMPT = `
أنت "وكيل الأوردرات الذكي" التابع لـ ai provider. مهمتك مساعدة الزبون في اختيار المنتج المناسب وإتمام أوردر شراء جاهز للتنفيذ.

القواعد الصارمة:
1. التزم فقط بالمعلومات الواردة في "قائمة المنتجات والسياسات" أدناه. يُمنع منعاً باتاً اختراع أي أسعار محددة أو أوزان أو خصومات أو مواعيد توصيل غير مذكورة في القائمة.
2. إذا سأل الزبون عن منتج أو تفصيل غير موجود في القائمة، وضّح بلطف أن هذا التفصيل يُؤكَّد مع فريق المبيعات ولا تخمّن من عندك.
3. اجعل ردودك مختصرة، ودودة، ومباشرة، ومناسبة للقراءة السريعة على الجوال.
4. عند رغبة الزبون في الشراء، اجمع منه بلطف البيانات الأربع المطلوبة لإتمام الأوردر:
   - الصنف والكمية (أو الموديل/الوزن المطلوب)
   - الاسم الكامل
   - رقم الهاتف
   - العنوان الكامل (المدينة / الحي)
5. بمجرد اكتمال البيانات الأربع، اعرض له ملخص الطلب بهذا الشكل الثابت:

✅ بطاقة أوردر جاهز للتنفيذ:
- العميل: [الاسم]
- الهاتف: [الرقم]
- العنوان: [العنوان]
- الطلب: [الصنف والكمية]
- الإجمالي المتوقع: [يُحدّد عند تأكيد السعر والتوصيل]

قائمة المنتجات والسياسات:
${PRODUCTS_AND_POLICY}
`.trim();

// ==========================================
// 2. إدارة حد الـ 3 أسئلة المجانية
// ==========================================
const COUNT_KEY = "aipr_order_agent_count";
const UNLOCK_KEY = "aipr_order_agent_unlocked";

let usedQuestions = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10);
let isUnlocked = localStorage.getItem(UNLOCK_KEY) === "true";
const conversationHistory = [];

const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const quotaBadge = document.getElementById("quotaBadge");
const resetQuotaBtn = document.getElementById("resetQuotaBtn");

function updateBadge() {
  if (isUnlocked) {
    quotaBadge.textContent = "مفتوح (مفعل)";
    return;
  }
  const remaining = Math.max(0, MAX_FREE_QUESTIONS - usedQuestions);
  quotaBadge.textContent = `المتبقي: ${remaining} / ${MAX_FREE_QUESTIONS}`;
}

function appendMessage(text, role = "bot", waLink = null) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;

  if (waLink) {
    const a = document.createElement("a");
    a.href = waLink;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "wa-btn";
    a.textContent = "التواصل عبر واتساب ai provider";
    div.appendChild(document.createElement("br"));
    div.appendChild(a);
  }

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function getWhatsAppLimitLink() {
  const msg = encodeURIComponent("مرحباً ai provider، جرّبت وكيل الأوردرات وأرغب بتفعيله أو الحصول على رمز التفعيل.");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

async function askGemini(messageText) {
  conversationHistory.push({
    role: "user",
    parts: [{ text: messageText }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: conversationHistory,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const reply =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "عذراً، لم أتمكن من صياغة الرد الآن. حاول مرة أخرى.";

  conversationHistory.push({
    role: "model",
    parts: [{ text: reply }]
  });

  return reply;
}

// ==========================================
// 3. معالجة الإرسال والاختبار المحلي
// ==========================================
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = "";

  // تفعيل النسخة عبر رمز التفعيل
  if (text === ACTIVATION_CODE) {
    isUnlocked = true;
    localStorage.setItem(UNLOCK_KEY, "true");
    updateBadge();
    appendMessage(text, "user");
    appendMessage("✅ تم تفعيل النسخة الكاملة بنجاح! يمكنك متابعة المحادثة الآن.", "system");
    return;
  }

  // التحقق من حد الـ 3 أسئلة المجانية
  if (!isUnlocked && usedQuestions >= MAX_FREE_QUESTIONS) {
    appendMessage(text, "user");
    appendMessage(
      "انتهت محاولات التجربة المجانية (3 أسئلة). لتفعيل وكيل الأوردرات الخاص بمتجرك أو طلب رمز التفعيل، تواصل معنا مباشرة عبر واتساب:",
      "bot",
      getWhatsAppLimitLink()
    );
    return;
  }

  appendMessage(text, "user");
  usedQuestions += 1;
  localStorage.setItem(COUNT_KEY, String(usedQuestions));
  updateBadge();

  sendBtn.disabled = true;
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "msg bot";
  loadingDiv.textContent = "جاري تجهيز الرد...";
  chatBox.appendChild(loadingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const reply = await askGemini(text);
    loadingDiv.remove();
    appendMessage(reply, "bot");

    if (!isUnlocked && usedQuestions >= MAX_FREE_QUESTIONS) {
      appendMessage(
        "هذه كانت آخر رسالة من التجربة المجانية (3 أسئلة). لإكمال التفعيل أو طلب رمز فتح التجربة تواصل معنا عبر واتساب:",
        "system",
        getWhatsAppLimitLink()
      );
    }
  } catch (err) {
    loadingDiv.remove();
    appendMessage(`حدث خطأ أثناء الاتصال بالنموذج:\n${err.message}`, "bot");
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
});

// زر لتصفير العداد أثناء الاختبار المحلي فقط
resetQuotaBtn.addEventListener("click", () => {
  usedQuestions = 0;
  isUnlocked = false;
  localStorage.removeItem(COUNT_KEY);
  localStorage.removeItem(UNLOCK_KEY);
  conversationHistory.length = 0;
  updateBadge();
  appendMessage("🔄 تم تصفير عداد التجربة للاختبار من جديد.", "system");
});

updateBadge();
