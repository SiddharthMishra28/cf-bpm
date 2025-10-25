export default {
  async fetch(request: Request, env: any): Promise<Response> {
    return new Response("BPM Rule Engine Worker is running", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};

export class BPMWorkflow {}
