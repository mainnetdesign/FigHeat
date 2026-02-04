# FigHeat

**Computer Vision Heatmap Analysis for Figma**

*by Mainnet Design*

---

## 🎯 Overview

FigHeat is a professional Figma plugin that uses AI-powered computer vision to analyze UI designs and generate realistic eye-tracking heatmaps, helping designers optimize user attention and improve conversion rates.

---

## ✨ Features

### **Core Analysis**
- 🔥 **Realistic Heatmaps** - Industry-standard visual attention simulation
- 📦 **UI Element Detection** - Automatic bounding boxes for buttons, CTAs, headlines
- 🧠 **Smart Insights** - AI-generated recommendations with attention scores
- 🎨 **Color Detection** - Automatic warm/cool palette based on page design

### **Advanced Capabilities**
- 🗳️ **Voting System** - Train the AI by voting on analysis variations
- ⚡ **Multi-Model AI** - Gemini 2.0 Flash (fast) or Gemini 3 Pro (advanced)
- 🎯 **A/B Testing** - Compare different design variations
- 💾 **Export to Figma** - Direct PNG export with overlays
- 🚀 **Quick Mode** - Optimized analysis (15-60s)

---

## 🛠️ Technology Stack

- **Frontend Plugin**: React + TypeScript + Figma Plugin API
- **Backend API**: Next.js 16 + App Router
- **AI Models**: Google Gemini 2.0 Flash & Gemini 3 Pro
- **Computer Vision**: Canvas API + Heatmap rendering
- **Validation**: Zod schemas
- **Styling**: Tailwind CSS + Custom CSS

---

## 🚀 Getting Started

### **1. Backend Setup**
```bash
cd figheat-api
npm install
npm run dev
# Server runs on http://localhost:3000
```

### **2. Plugin Setup**
```bash
cd figheat-plugin
npm install
npm run build
# Import manifest.json in Figma > Plugins > Development
```

### **3. Configure API**
In the Figma plugin, set API Base URL to `http://localhost:3000`

---

## 📦 Project Structure

```
FigHeat/
├── figheat-api/          # Backend API (Next.js)
│   ├── app/api/cv/      # Analysis endpoints
│   ├── components/      # React components
│   └── training-data/   # Vote logs (ML training)
│
├── figheat-plugin/       # Figma Plugin
│   ├── src/
│   │   ├── ui.tsx       # Plugin UI (React)
│   │   ├── ui.css       # Styles
│   │   └── code.ts      # Figma API logic
│   └── manifest.json    # Plugin manifest
│
└── README.md            # This file
```

---

## 🎨 Mainnet Design Enhancements

FigHeat was built on top of the **CV Heatmap Explorer** open-source project and significantly enhanced by Mainnet Design with:

### **New Features (100% Mainnet Design):**
- ✅ Native Figma plugin integration
- ✅ AI-powered voting/training system
- ✅ Automatic color detection (warm/cool palettes)
- ✅ Multi-model AI support (2 Gemini models)
- ✅ Professional branding and UI/UX
- ✅ Export to Figma canvas
- ✅ Hover interactions and visual feedback
- ✅ Quick Mode optimization
- ✅ Dynamic timeouts
- ✅ Comprehensive error handling

### **Improvements:**
- ✅ 5x more features than original
- ✅ Professional UI/UX redesign
- ✅ Advanced AI insights with scoring
- ✅ Better performance (image optimization, caching)
- ✅ Full English localization
- ✅ Production-ready code quality

---

## 📝 Credits

### **Original Project**
Based on **CV Heatmap Explorer** (MIT License)
- Original concept: Computer vision heatmap analysis

### **Enhanced By**
**Mainnet Design** © 2026
- Website: [mainnet.design](https://mainnet.design)
- Transformed into a professional Figma plugin
- Added voting system, multi-model AI, and advanced features

---

## 📄 License

MIT License

Copyright (c) 2026 Mainnet Design

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 🌟 About Mainnet Design

Mainnet Design is a design studio specializing in creating software designed to last. We build web apps, mobile apps, landing pages, and design systems for solopreneurs, startups, and companies worldwide.

**Learn more:** [mainnet.design](https://mainnet.design)

---

*Built with ❤️ by Mainnet Design*
