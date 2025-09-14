// Simple in-memory signaling store for Netlify Functions (single instance per cold start)
const rooms = new Map();

exports.handler = async (event) => {
  const { httpMethod, body, headers } = event;

  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, x-room-pin",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    };
  }

  if (httpMethod === "POST") {
    try {
      const data = JSON.parse(body || "{}");
      if (!data || !data.pin) {
        return {
          statusCode: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "pin required" }),
        };
      }
      if (!rooms.has(data.pin)) rooms.set(data.pin, []);
      rooms.get(data.pin).push(data.signal);
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: true }),
      };
    } catch {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "invalid json" }),
      };
    }
  }

  if (httpMethod === "GET") {
    const pin =
      headers["x-room-pin"] ||
      headers["X-Room-Pin"] ||
      headers["x-room-pin".toLowerCase()];
    if (!pin) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "x-room-pin required" }),
      };
    }
    const signals = rooms.get(pin) || [];
    rooms.set(pin, []); // clear after read
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ signals }),
    };
  }

  return {
    statusCode: 405,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "method not allowed" }),
  };
};
