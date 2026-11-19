const PRIORITY_TEXT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash"
];

const BLOCKED_KEYWORDS = [
    "tts",
    "audio",
    "image",
    "imagen",
    "veo",
    "embedding",
    "aqa",
    "live"
];

function jsonResponse(statusCode, payload) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
    };
}

async function getDynamicTextModels(apiKey) {
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return [];

        const data = await res.json().catch(() => ({}));
        return (data.models || [])
            .filter(
                (m) =>
                    Array.isArray(m.supportedGenerationMethods) &&
                    m.supportedGenerationMethods.includes("generateContent")
            )
            .map((m) => String(m.name || "").replace(/^models\//, ""))
            .filter(
                (name) =>
                    name &&
                    !BLOCKED_KEYWORDS.some((kw) => name.toLowerCase().includes(kw))
            );
    } catch {
        return [];
    }
}

exports.handler = async function (event) {
    if (event.httpMethod !== "POST") {
        return jsonResponse(405, { error: "Method Not Allowed" });
    }

    try {
        const body = JSON.parse(event.body || "{}");
        const question = String(body.question || "").trim();
        const activationKey = String(body.activationKey || "").trim();

        const VALID_KEYS = ["AI-2026-VIP", "AIPR-PRO-01"];
        if (activationKey && !VALID_KEYS.includes(activationKey)) {
            return jsonResponse(403, { error: "مفتاح التفعيل غير صالح!" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return jsonResponse(500, {
                error: "مفتاح الذكاء الاصطناعي (GEMINI_API_KEY) غير معرّف في السيرفر."
            });
        }

        if (!question) {
            return jsonResponse(400, { error: "يرجى كتابة سؤال أولاً." });
        }

        const prompt =
            "أنت وكيل ذكي واحترافي لمنصة 'ai provider' المتخصصة في التجارة وسلاسل التوريد والأعمال الرقمية. أجب بوضوح واختصار ودقة باللغة العربية على السؤال التالي:\n" +
            question;

        const dynamicModels = await getDynamicTextModels(apiKey);

        const candidates = Array.from(
            new Set([
                ...PRIORITY_TEXT_MODELS,
                ...dynamicModels
            ])
        ).slice(0, 5);

        let lastStatus = 503;
        let lastError = "الخدمة تشهد ضغطاً مؤقتاً الآن، يرجى المحاولة بعد قليل.";

        for (const model of candidates) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }]
                        }),
                        signal: AbortSignal.timeout(7000)
                    }
                );

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    const reply =
                        data.candidates?.[0]?.content?.parts?.[0]?.text ||
                        "لم يتم استلام رد نصي من النموذج.";

                    return jsonResponse(200, { reply, modelUsed: model });
                }

                lastStatus = response.status;
                const apiError = data.error?.message || "";

                // إذا كان الخطأ في مفتاح Gemini نفسه (مثلاً غير صالح أو مقيد)، لا داعي لتجربة بقية النماذج
                if (
                    response.status === 400 &&
                    apiError.toLowerCase().includes("api key")
                ) {
                    return jsonResponse(400, {
                        error: "مفتاح GEMINI_API_KEY غير صالح أو مقيّد."
                    });
                }

                if (apiError) {
                    lastError = apiError;
                }
            } catch (err) {
                lastError =
                    err.name === "TimeoutError"
                        ? "انتهت مهلة الاتصال بالخادم، يرجى المحاولة مرة أخرى."
                        : "تعذر الاتصال بالخادم حالياً.";
            }
        }

        return jsonResponse(lastStatus, { error: lastError });
    } catch (error) {
        return jsonResponse(500, {
            error: "حدث خطأ داخلي في معالجة الطلب: " + error.message
        });
    }
};
