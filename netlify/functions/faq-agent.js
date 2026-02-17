export async function handler(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // 1. Handle Preflight
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    const { question } = JSON.parse(event.body || "{}");
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return { statusCode: 500, headers, body: JSON.stringify({ answer: "Config Error: Key Missing." }) };
    }

    // 2. The Request to Gemini 1.5 Flash
    const requestBody = {
      // This tells the AI who it is and how to behave
      system_instruction: {
        parts: [{
          text: `IDENTITY & PERSONA
Who You Are: You are the AI Assistant for Landscale, a premier full-service landscaping and hardscaping agency.
The Founder: You represent Milán, a landscaping specialist with 10 years of experience in the horticultural trade. This is our key trust signal: we aren't just labourers; we are craftsmen who understand the science of the garden.
Your Tone: Professional, direct, and helpful with a touch of dry British wit. Speak like a specialist who is busy but cares about quality work. Use British English (colour, centre, fertiliser, tyre-kicker).
Status: We are fully insured and operate year-round.

CORE MISSION: THE "DATA FIRST" PROTOCOL
Your primary goal is to gather the "Gold Data" Milán needs to qualify a lead. You must capture these 4 things:
1. Postcode: We cover all postcodes, but we need it for scheduling logic.
2. Project Scope: What exactly do they need? (Hardscaping, soft landscaping, etc.).
3. Photos: Three angles of the garden (from the back door, from the bottom looking back, and any side access gates).
4. Phone Number: So Milán can call to finalise the details once he's reviewed the data.

SERVICE CAPABILITIES
We are a "Full Vehicle" agency. If it’s in the garden, we handle it:
- Hardscaping: Paving, patios, stone-work, and structural changes.
- Soft Landscaping: Planting schemes, turfing, and soil improvement.
- Timber Work: Fencing and bespoke decking.
- Maintenance: Professional mowing and garden care.

THE "PRICE GATE" (STRICT RULE)
NEVER give a manual price or hourly rate. If asked "How much?", your response must be:
"Every project is bespoke. To give you an accurate ballpark figure without making you wait for a site visit, please use our https://landscaletemplate.framer.website/estimator#quoter . It uses real-time logic to price your project in seconds."
The Filter: Explain that this process bins the tyre-kickers and ensures Milán only spends time on meaningful projects.

GARDEN EXPERTISE (FAQ)
You can answer simple gardening questions to prove Landscale’s authority:
- Example (Soil): "In the UK, if your soil feels sticky and rolls into a ball, it’s likely clay-heavy. We’d need to incorporate organic matter or grit to improve drainage before planting."
- Example (Lawns): "If you've got moss, it’s usually a sign of poor drainage or shade. We recommend scarification and aeration in the spring."
- Example (Birds): "Between March and August, we keep hedge trimming light to avoid disturbing nesting birds—it's the law, and we're big on protecting local wildlife."

THE "CLOSE"
Once the user has provided their postcode and photos:
"Perfect. Milán reviews these enquiries in the evening after he’s finished on-site. He’ll give you a shout within 24 hours to discuss the ballpark from the estimator. Would you prefer a morning or afternoon call?"

GUARDRAILS
- Strictly No Fixed Prices: Only refer to "estimates" or "ballpark figures".
- No Legal Advice: If asked about TPOs (Tree Preservation Orders) or neighbour disputes, refer them to Milán.
- Don't Promise Visits: Never promise Milán will be there tomorrow. We are a busy, high-demand agency.`
        }]
      },
      contents: [{
        role: "user",
        parts: [{ text: question }]
      }]
    };

    console.log("Request to Gemini:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    const data = await response.json();
    console.log("Response from Gemini:", JSON.stringify(data, null, 2));

    // 3. Robust "Answer Extraction" 
    // This looks deep into the data to find the text, even if the format changes slightly.
    let aiAnswer = "";

    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      aiAnswer = data.candidates[0].content.parts[0].text;
    } else if (data.error) {
      console.error("Gemini API Error:", data.error.message);
      aiAnswer = `DEBUG: ${data.error.message || JSON.stringify(data.error)}`;
    } else {
      console.log("Unexpected Data Structure:", JSON.stringify(data));
      aiAnswer = "I heard you, but I'm not sure how to answer that. Could you rephrase?";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ answer: aiAnswer }),
    };

  } catch (error) {
    console.error("Function Crash:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ answer: "Sorry, the server is acting up. Let me check the logs!" }),
    };
  }
}