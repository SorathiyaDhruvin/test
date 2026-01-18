# Interior Traverse - Virtual Tour

A 360° virtual tour application built with [Pannellum](https://pannellum.org/).

## Helper Artifacts
- [Task List](file:///c:/Users/Deepak/.gemini/antigravity/brain/2754c691-4404-4bb1-a7e1-dae8d9c7970c/task.md)

## How to Run

Since call to `fetch("config.json")` is blocked by valid CORS policy when opening `index.html` directly from the file system, you need a local web server.

### Prerequisite
Ensure you have **Node.js** installed (which you do).

### Start the Server
Run the following command in this directory:

```powershell
npx http-server .
```

This will start a local server (usually at `http://127.0.0.1:8080`). Open that URL in your browser to view the tour.

## Project Structure
- `index.html`: Main entry point and viewer container.
- `config.json`: Defines scenes, hotspots, and navigation logic.
- `script.js`: Handles scene loading and interactions.
- `assets/`: Contains panorama images.

## Deployment

### Deploy to Vercel (Recommended)
You can deploy this project to Vercel for free.

**Option 1: Using Vercel CLI (fastest)**
1.  Install Vercel CLI: `npm i -g vercel`
2.  Run: `vercel`
3.  Follow the prompts (accept defaults).

**Option 2: Using GitHub**
1.  Push this code to a GitHub repository.
2.  Go to [Vercel.com](https://vercel.com) -> "Add New Project".
3.  Import your repository.
4.  Vercel will detect it as a static site. Click **Deploy**.

