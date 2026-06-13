import React from "react";
import ReactDOM from "react-dom/client";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import Papa from "papaparse";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import * as pdfjsLib from "pdfjs-dist";
import { z } from "zod";
import "./styles.css";

const flowSteps = [
  {
    slug: "patient-details",
    title: "Patient Details",
    subtitle: "Capture identity, visit context, and baseline clinical notes.",
    checkpoint: "Demographics and intake data",
    detail: "Start with the minimum required record so the rest of the flow has a stable patient anchor.",
    nextLabel: "Continue to Lab Investigation",
  },
  {
    slug: "lab-investigation",
    title: "Lab Investigation",
    subtitle: "Record laboratory values and the review status for each result.",
    checkpoint: "Lab panel and flags",
    detail: "This page becomes the shared source of truth for blood work, chemistry values, and missing labs.",
    nextLabel: "Continue to Patient Care Insights",
  },
  {
    slug: "patient-care-insights",
    title: "Patient Care Insights",
    subtitle: "Summarize care needs, risk signals, and clinician observations.",
    checkpoint: "Care notes and context",
    detail: "We will use this stage to turn the raw intake into actionable bedside context.",
    nextLabel: "Continue to Comparative Analysis",
  },
  {
    slug: "comparative-analysis",
    title: "Comparative Analysis",
    subtitle: "Compare scoring approaches and current model behavior side by side.",
    checkpoint: "Model comparison",
    detail: "This route will later hold the strongest model, ensemble output, and disagreement view.",
    nextLabel: "Continue to Decision Support",
  },
  {
    slug: "decision-support",
    title: "Decision Support",
    subtitle: "Translate the model output into recommendations, signals, consensus, and feedback.",
    checkpoint: "Disposition and follow-up",
    detail: "This stage turns the analysis into next-step guidance, top contributing signals, and clinician feedback.",
    nextLabel: "Continue to Backend Processing",
  },
  {
    slug: "backend-processing",
    title: "Backend Processing",
    subtitle: "Show preprocessing, feature engineering, scaling, and validation steps.",
    checkpoint: "Pipeline trace",
    detail: "The backend view keeps the model-ready data path visible for debugging and trust.",
    nextLabel: "Continue to Model Analytical Hub",
  },
  {
    slug: "model-analytical-hub",
    title: "Model Hub",
    subtitle: "Review every trained model grouped by machine learning and deep learning families.",
    checkpoint: "Final review",
    detail: "This is the final stop in the flow and now hosts the trained model inventory and family breakdown.",
    nextLabel: "Review flow completion",
  },
];

const stepIndexBySlug = new Map(flowSteps.map((step, index) => [step.slug, index]));
const firstStepSlug = flowSteps[0].slug;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const labFieldSpecs = [
  {
    key: "fastingGlucose",
    label: "Fasting glucose",
    panel: "diabetes",
    unit: "mg/dL",
    hint: "Normal: 70-99",
    aliases: ["fasting glucose", "fbg", "fasting sugar"],
    defaultValue: "142",
  },
  {
    key: "postprandialGlucose",
    label: "Postprandial glucose",
    panel: "diabetes",
    unit: "mg/dL",
    hint: "Normal: < 140",
    aliases: ["postprandial glucose", "pp glucose", "ppbs", "post meal glucose"],
    defaultValue: "208",
  },
  {
    key: "hba1c",
    label: "HbA1c",
    panel: "diabetes",
    unit: "%",
    hint: "Normal: 4.0-5.6",
    aliases: ["hba1c", "a1c", "glycated hemoglobin"],
    defaultValue: "8.4",
  },
  {
    key: "hemoglobin",
    label: "Hemoglobin",
    panel: "blood",
    unit: "g/dL",
    hint: "Typical adult range: 12-17.5",
    aliases: ["hemoglobin", "hb"],
    defaultValue: "12.1",
  },
  {
    key: "wbcCount",
    label: "WBC count",
    panel: "blood",
    unit: "10^3/µL",
    hint: "Normal: 4-11",
    aliases: ["wbc count", "white blood cell count", "wbc"],
    defaultValue: "8.6",
  },
  {
    key: "plateletCount",
    label: "Platelet count",
    panel: "blood",
    unit: "10^3/µL",
    hint: "Normal: 150-450",
    aliases: ["platelet count", "platelets", "plt"],
    defaultValue: "265",
  },
  {
    key: "ldl",
    label: "LDL",
    panel: "lipid",
    unit: "mg/dL",
    hint: "Target: < 100",
    aliases: ["ldl", "ldl cholesterol"],
    defaultValue: "118",
  },
  {
    key: "hdl",
    label: "HDL",
    panel: "lipid",
    unit: "mg/dL",
    hint: "Target: > 40",
    aliases: ["hdl", "hdl cholesterol"],
    defaultValue: "46",
  },
  {
    key: "triglycerides",
    label: "Triglycerides",
    panel: "lipid",
    unit: "mg/dL",
    hint: "Normal: < 150",
    aliases: ["triglycerides", "tg"],
    defaultValue: "174",
  },
  {
    key: "ast",
    label: "AST",
    panel: "liver",
    unit: "U/L",
    hint: "Normal: 10-40",
    aliases: ["ast", "sgot"],
    defaultValue: "28",
  },
  {
    key: "alt",
    label: "ALT",
    panel: "liver",
    unit: "U/L",
    hint: "Normal: 7-56",
    aliases: ["alt", "sgpt"],
    defaultValue: "32",
  },
  {
    key: "bilirubin",
    label: "Bilirubin",
    panel: "liver",
    unit: "mg/dL",
    hint: "Normal: 0.1-1.2",
    aliases: ["bilirubin", "total bilirubin"],
    defaultValue: "0.8",
  },
  {
    key: "albumin",
    label: "Albumin",
    panel: "liver",
    unit: "g/dL",
    hint: "Normal: 3.5-5.0",
    aliases: ["albumin"],
    defaultValue: "4.1",
  },
  {
    key: "creatinine",
    label: "Creatinine",
    panel: "kidney",
    unit: "mg/dL",
    hint: "Normal: 0.6-1.3",
    aliases: ["creatinine", "serum creatinine", "scr"],
    defaultValue: "0.9",
  },
  {
    key: "urea",
    label: "Urea",
    panel: "kidney",
    unit: "mg/dL",
    hint: "Typical range: 7-20",
    aliases: ["urea", "blood urea nitrogen", "bun"],
    defaultValue: "21",
  },
  {
    key: "egfr",
    label: "eGFR",
    panel: "kidney",
    unit: "mL/min/1.73m²",
    hint: "Normal: > 90",
    aliases: ["egfr", "gfr"],
    defaultValue: "92",
  },
  {
    key: "sodium",
    label: "Sodium",
    panel: "electrolytes",
    unit: "mmol/L",
    hint: "Normal: 135-145",
    aliases: ["sodium", "na"],
    defaultValue: "139",
  },
  {
    key: "potassium",
    label: "Potassium",
    panel: "electrolytes",
    unit: "mmol/L",
    hint: "Normal: 3.5-5.1",
    aliases: ["potassium", "k"],
    defaultValue: "4.2",
  },
  {
    key: "chloride",
    label: "Chloride",
    panel: "electrolytes",
    unit: "mmol/L",
    hint: "Normal: 98-107",
    aliases: ["chloride", "cl"],
    defaultValue: "102",
  },
  {
    key: "bicarbonate",
    label: "Bicarbonate",
    panel: "electrolytes",
    unit: "mmol/L",
    hint: "Normal: 22-29",
    aliases: ["bicarbonate", "co2", "hco3"],
    defaultValue: "24",
  },
];

const labPanels = [
  { key: "diabetes", label: "Diabetes", description: "Glucose control and HbA1c" },
  { key: "blood", label: "Blood", description: "CBC and hematology" },
  { key: "lipid", label: "Lipid", description: "Cardiovascular risk" },
  { key: "liver", label: "Liver", description: "Hepatic enzymes and proteins" },
  { key: "kidney", label: "Kidney", description: "Renal function" },
  { key: "electrolytes", label: "Electrolytes", description: "Core chemistry balance" },
];

const labDefaultValues = Object.fromEntries(labFieldSpecs.map((field) => [field.key, field.defaultValue]));

const labSchema = z.object(
  Object.fromEntries(
    labFieldSpecs.map((field) => [
      field.key,
      z
        .string()
        .trim()
        .min(1, "Required")
        .refine((value) => !Number.isNaN(Number(value)), "Enter a number"),
    ]),
  ),
);

const initialAnalysisState = {
  status: "idle",
  runCount: 0,
  lastRunAt: null,
  overallScore: null,
  riskLevel: "Not run",
  primaryModel: "",
  modelRows: [],
  performanceSeries: [],
  featureAttributions: [],
  shapSummary: [],
  trendSeries: [],
  radarMetrics: [],
  heatmapCells: [],
  history: [],
  beforeAfter: null,
  progression: [],
  summaryPoints: [],
};

const analysisModelCatalog = [
  { key: "isolation-forest", name: "Isolation Forest", accuracy: 0.84, precision: 0.81, recall: 0.79, f1: 0.80, auc: 0.86, latencyMs: 6.2, memoryMb: 92 },
  { key: "one-class-svm", name: "One-Class SVM", accuracy: 0.79, precision: 0.77, recall: 0.73, f1: 0.75, auc: 0.82, latencyMs: 8.4, memoryMb: 74 },
  { key: "local-outlier-factor", name: "Local Outlier Factor", accuracy: 0.81, precision: 0.78, recall: 0.75, f1: 0.76, auc: 0.84, latencyMs: 7.1, memoryMb: 81 },
  { key: "autoencoder", name: "Autoencoder", accuracy: 0.86, precision: 0.84, recall: 0.81, f1: 0.82, auc: 0.88, latencyMs: 5.4, memoryMb: 96 },
  { key: "anomaly-transformer", name: "Anomaly Transformer", accuracy: 0.88, precision: 0.86, recall: 0.82, f1: 0.84, auc: 0.90, latencyMs: 7.8, memoryMb: 108 },
  { key: "variational-autoencoder", name: "Variational Autoencoder", accuracy: 0.87, precision: 0.85, recall: 0.83, f1: 0.84, auc: 0.89, latencyMs: 6.0, memoryMb: 99 },
  { key: "ganomaly", name: "GANomaly", accuracy: 0.87, precision: 0.84, recall: 0.82, f1: 0.83, auc: 0.89, latencyMs: 8.1, memoryMb: 104 },
  { key: "cnn-autoencoder", name: "CNN Autoencoder", accuracy: 0.85, precision: 0.83, recall: 0.80, f1: 0.81, auc: 0.87, latencyMs: 9.1, memoryMb: 111 },
  { key: "deep-svdd", name: "Deep SVDD", accuracy: 0.86, precision: 0.84, recall: 0.81, f1: 0.82, auc: 0.88, latencyMs: 6.5, memoryMb: 95 },
  { key: "ensemble", name: "Ensemble", accuracy: 0.91, precision: 0.89, recall: 0.87, f1: 0.88, auc: 0.94, latencyMs: 10.2, memoryMb: 122 },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const emptyPatientState = {
  demographics: {
    patientId: "",
    fullName: "",
    age: "",
    sex: "Female",
    locationType: "Clinic",
  },
  visit: {
    chiefComplaint: "",
    symptomOnset: "",
    visitDate: "",
    triagePriority: "Routine",
    notes: "",
  },
  medicalHistory: {
    comorbidities: "Diabetes, hypertension",
    allergies: "",
    currentMedications: "Metformin, amlodipine",
    familyHistory: "",
    socialHistory: "",
  },
  measurements: {
    heartRate: "84",
    systolicBp: "136",
    diastolicBp: "88",
    spo2: "94",
    temperature: "37.4",
    respiratoryRate: "16",
    weight: "64.2",
    height: "168",
  },
  labs: {
    ...labDefaultValues,
  },
  careInsights: {
    clinicianSummary: "",
    riskSignals: [],
  },
  comparativeAnalysis: {
    selectedModel: "Ensemble",
    notes: "",
  },
  decisionSupport: {
    disposition: "",
    referralTarget: "",
  },
  backendProcessing: {
    pipelineStatus: "Draft",
    featureCount: 0,
  },
  modelHub: {
    activeModel: "Anomaly Transformer",
    reviewNote: "",
  },
};

const PatientContext = React.createContext(null);

function getHighestUnlockedIndex(completedSteps) {
  let highest = -1;
  for (let index = 0; index < flowSteps.length; index += 1) {
    if (completedSteps.includes(flowSteps[index].slug)) {
      highest = index;
      continue;
    }
    break;
  }
  return Math.max(highest, 0);
}

function PatientProvider({ children }) {
  const [patient, setPatient] = React.useState(emptyPatientState);
  const [completedSteps, setCompletedSteps] = React.useState([]);
  const [modelResults, setModelResults] = React.useState({
    ...initialAnalysisState,
  });

  const updateSection = React.useCallback((section, value) => {
    setPatient((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...value,
      },
    }));
  }, []);

  const markStepComplete = React.useCallback((slug) => {
    setCompletedSteps((current) => (current.includes(slug) ? current : [...current, slug]));
  }, []);

  const markStepIncomplete = React.useCallback((slug) => {
    setCompletedSteps((current) => current.filter((item) => item !== slug));
  }, []);

  const resetFlow = React.useCallback(() => {
    setPatient(emptyPatientState);
    setCompletedSteps([]);
    setModelResults({ ...initialAnalysisState });
  }, []);

  const value = React.useMemo(
    () => ({
      patient,
      completedSteps,
      modelResults,
      setModelResults,
      updateSection,
      markStepComplete,
      markStepIncomplete,
      resetFlow,
      highestUnlockedIndex: getHighestUnlockedIndex(completedSteps),
    }),
    [completedSteps, modelResults, markStepComplete, markStepIncomplete, resetFlow, updateSection, patient],
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

function usePatient() {
  const context = React.useContext(PatientContext);
  if (!context) {
    throw new Error("usePatient must be used inside PatientProvider");
  }
  return context;
}

function StepGuard() {
  return <Outlet />;
}

function AppShell() {
  const { completedSteps } = usePatient();
  const location = useLocation();
  const currentSlug = location.pathname.split("/").filter(Boolean)[0] || firstStepSlug;
  const currentStep = flowSteps[stepIndexBySlug.get(currentSlug) ?? 0];
  const [theme, setTheme] = React.useState(() => {
    if (typeof window === "undefined") {
      return "night";
    }
    return window.localStorage.getItem("dashboard-theme") || "night";
  });

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.dataset.theme = theme;
    window.localStorage.setItem("dashboard-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Rural health workflow</p>
          <h1>Patient details to model hub</h1>
          <p className="lede">
            The active page stays focused on the current clinical step, with Back and Continue controls inside each
            page rather than a separate roadmap screen.
          </p>
        </div>
        <div className="topbar__status">
          <div className="status-chip">
            <span>Active page</span>
            <strong>{currentStep?.title || "Patient details"}</strong>
          </div>
          <div className="status-chip">
            <span>Workflow state</span>
            <strong>{completedSteps.length ? `${completedSteps.length} completed` : "Ready to start"}</strong>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "day" ? "night" : "day"))}
            aria-pressed={theme === "day"}
            aria-label={theme === "day" ? "Switch to night mode" : "Switch to day mode"}
          >
            <span>{theme === "day" ? "Night mode" : "Day mode"}</span>
            <strong>{theme === "day" ? "On" : "Off"}</strong>
          </button>
        </div>
      </header>

      <main className="content-shell">
        <Outlet />
      </main>
    </div>
  );
}

function StepLayout({ step, children, nextLabel, nextDisabled, onNext }) {
  const navigate = useNavigate();
  const { completedSteps, markStepComplete, highestUnlockedIndex } = usePatient();
  const stepIndex = stepIndexBySlug.get(step.slug) ?? 0;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === flowSteps.length - 1;
  const previousStep = !isFirst ? flowSteps[stepIndex - 1] : null;
  const nextStep = !isLast ? flowSteps[stepIndex + 1] : null;
  const isComplete = completedSteps.includes(step.slug);

  const completeAndContinue = () => {
    if (onNext) {
      onNext({
        stepSlug: step.slug,
        markStepComplete,
        navigate,
        nextStep,
        stepIndex,
        highestUnlockedIndex,
      });
      return;
    }

    markStepComplete(step.slug);
    if (nextStep) {
      navigate(`/${nextStep.slug}`);
    }
  };

  return (
    <section className="flow-page">
      <div className="flow-page__header">
        <div>
          <p className="eyebrow">Step {stepIndex + 1}</p>
          <h2>{step.title}</h2>
          <p className="lede">{step.subtitle}</p>
        </div>
        <div className="flow-page__actions">
          <span className="status-pill">{isComplete ? "Marked complete" : "In progress"}</span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => previousStep && navigate(`/${previousStep.slug}`)}
            disabled={!previousStep}
          >
            Back
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={completeAndContinue}
            disabled={nextDisabled}
          >
            {nextLabel || (nextStep ? step.nextLabel : "Finish route")}
          </button>
        </div>
      </div>

      {children}
    </section>
  );
}

function PageCard({ title, eyebrow, children }) {
  return (
    <article className="card">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <div className="card__body">{children}</div>
    </article>
  );
}

function StepSkeleton({ step, left, right, footer }) {
  return (
    <StepLayout step={step}>
      <div className="grid-grid">
        <PageCard title="Primary workspace" eyebrow="Active area">
          {left}
        </PageCard>
        <PageCard title="Supporting context" eyebrow="Reference area">
          {right}
        </PageCard>
      </div>
      <div className="card card--wide">
        <p className="eyebrow">Route notes</p>
        <div className="route-notes">
          <p>{step.detail}</p>
          <p>{footer}</p>
        </div>
      </div>
    </StepLayout>
  );
}

function SectionCard({ title, eyebrow, description, children, compact = false }) {
  return (
    <section className={`section-card${compact ? " section-card--compact" : ""}`}>
      <div className="section-card__head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        {description ? <p className="section-card__description">{description}</p> : null}
      </div>
      <div className="section-card__body">{children}</div>
    </section>
  );
}

function TwoColumnFields({ children }) {
  return <div className="field-grid field-grid--two">{children}</div>;
}

function NumberSummary({ label, value, suffix }) {
  return (
    <div className="summary-pill">
      <span>{label}</span>
      <strong>
        {value}
        {suffix || ""}
      </strong>
    </div>
  );
}

function AnalysisSection({ unlocked, eyebrow, title, description, lockMessage, children }) {
  return (
    <section className={`analysis-section${unlocked ? "" : " is-locked"}`}>
      <div className="section-card__head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          {description ? <p className="section-card__description">{description}</p> : null}
        </div>
      </div>
      {unlocked ? (
        <div className="analysis-section__body">{children}</div>
      ) : (
        <div className="analysis-lock">
          <strong>Locked until run</strong>
          <p>{lockMessage}</p>
        </div>
      )}
    </section>
  );
}

function GraphPanel({ title, subtitle, items, valueKey, valueLabel, reverse = false }) {
  const maxValue = Math.max(...items.map((item) => parseNumeric(item[valueKey] ?? 0)), 1);

  return (
    <div className="graph-panel">
      <div className="graph-panel__head">
        <div>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>
        <span>{valueLabel}</span>
      </div>
      <div className="graph-panel__bars">
        {items.map((item) => {
          const value = parseNumeric(item[valueKey] ?? 0);
          const width = reverse ? (1 - value / maxValue) * 100 : (value / maxValue) * 100;
          return (
            <div key={item.key || item.label} className="graph-panel__row">
              <div className="graph-panel__label">{item.name || item.label}</div>
              <div className="bar">
                <span style={{ width: `${Math.max(8, width)}%` }} />
              </div>
              <div className="graph-panel__value">
                {value}
                {valueKey === "latencyMs" ? " ms" : valueKey === "memoryMb" ? " MB" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnomalyTrendChart({ series, score, riskLevel }) {
  const width = 640;
  const height = 240;
  const padding = 24;
  const minValue = 0;
  const maxValue = 1;
  const points = series.map((point, index) => {
    const x = padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2);
    const normalized = (point.score - minValue) / (maxValue - minValue);
    const y = height - padding - normalized * (height - padding * 2);
    return { ...point, x, y };
  });
  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = `M ${padding} ${height - padding} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1]?.x || width - padding} ${height - padding} Z`;
  const thresholdY = height - padding - 0.7 * (height - padding * 2);

  return (
    <div className="viz-card">
      <div className="viz-card__head">
        <div>
          <strong>Score trend</strong>
          <p>Recent anomaly trajectory with a high-risk threshold line.</p>
        </div>
        <span>{riskLevel}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg" role="img" aria-label="Anomaly score trend chart">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(114,215,255,0.36)" />
            <stop offset="100%" stopColor="rgba(114,215,255,0.02)" />
          </linearGradient>
        </defs>
        <line x1={padding} x2={width - padding} y1={thresholdY} y2={thresholdY} className="viz-threshold" />
        <text x={width - padding} y={thresholdY - 6} className="viz-label viz-label--threshold">
          Alert threshold
        </text>
        <path d={areaPath} className="viz-area" fill="url(#trendFill)" />
        <polyline points={linePath} className="viz-line" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.5" className="viz-point" />
            <text x={point.x} y={height - 8} className="viz-label">
              {point.label}
            </text>
          </g>
        ))}
        <text x={padding} y={18} className="viz-label viz-label--axis">
          1.0
        </text>
        <text x={padding} y={height - 14} className="viz-label viz-label--axis">
          0.0
        </text>
      </svg>
      <div className="viz-foot">
        <span>Latest score: {score}</span>
        <span>Trend series length: {series.length}</span>
      </div>
    </div>
  );
}

function RadarChart({ metrics }) {
  const width = 320;
  const height = 320;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 112;
  const angles = metrics.map((_, index) => (-Math.PI / 2) + (index / metrics.length) * Math.PI * 2);
  const polygon = metrics
    .map((metric, index) => {
      const value = clamp(metric.value, 0, 1);
      const x = centerX + Math.cos(angles[index]) * radius * value;
      const y = centerY + Math.sin(angles[index]) * radius * value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="viz-card viz-card--radar">
      <div className="viz-card__head">
        <div>
          <strong>Clinical anomaly radar</strong>
          <p>Higher area means stronger deviation from the expected band.</p>
        </div>
        <span>0 to 1</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg viz-svg--radar" role="img" aria-label="Clinical anomaly radar chart">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <circle key={ring} cx={centerX} cy={centerY} r={radius * ring} className="viz-radar-ring" />
        ))}
        {metrics.map((metric, index) => {
          const angle = angles[index];
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          const labelX = centerX + Math.cos(angle) * (radius + 22);
          const labelY = centerY + Math.sin(angle) * (radius + 22);
          return (
            <g key={metric.label}>
              <line x1={centerX} y1={centerY} x2={x} y2={y} className="viz-radar-axis" />
              <circle cx={x} cy={y} r="3" className="viz-radar-dot" />
              <text x={labelX} y={labelY} className="viz-label viz-label--radar">
                {metric.label}
              </text>
            </g>
          );
        })}
        <polygon points={polygon} className="viz-radar-polygon" />
      </svg>
      <div className="viz-grid">
        {metrics.map((metric) => (
          <div key={metric.label} className="viz-meter">
            <span>{metric.label}</span>
            <strong>{Math.round(metric.value * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapGrid({ cells }) {
  return (
    <div className="viz-card">
      <div className="viz-card__head">
        <div>
          <strong>Feature heatmap</strong>
          <p>Top contributing inputs and their current strength.</p>
        </div>
        <span>{cells.length} features</span>
      </div>
      <div className="heatmap-grid">
        {cells.map((cell) => (
          <div key={cell.label} className={`heatmap-cell heatmap-cell--${cell.tone}`}>
            <strong>{cell.label}</strong>
            <span>{Math.round(cell.value * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnomalySummaryStrip({ modelRows }) {
  const strongest = [...modelRows].sort((a, b) => b.score - a.score).slice(0, 4);
  return (
    <div className="viz-card viz-card--strip">
      <div className="viz-card__head">
        <div>
          <strong>Detector consensus strip</strong>
          <p>Quick read of the strongest anomaly detectors after the run.</p>
        </div>
        <span>Consensus</span>
      </div>
      <div className="consensus-strip">
        {strongest.map((model) => (
          <div key={model.key} className="consensus-chip">
            <span>{model.name}</span>
            <strong>{Math.round(model.score * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressComparisonCard({ beforeAfter, progression }) {
  const delta = beforeAfter?.delta ?? 0;
  const improving = beforeAfter?.direction === "improving";
  const worsening = beforeAfter?.direction === "worsening";

  return (
    <div className="viz-card viz-card--strip">
      <div className="viz-card__head">
        <div>
          <strong>Before / after comparison</strong>
          <p>How the current run compares to the previous state of the flow.</p>
        </div>
        <span className={improving ? "viz-tag viz-tag--good" : worsening ? "viz-tag viz-tag--warn" : "viz-tag"}>
          {beforeAfter?.direction || "baseline"}
        </span>
      </div>
      <div className="compare-grid">
        {progression.map((item) => (
          <div key={item.label} className={`compare-card compare-card--${item.tone}`}>
            <span>{item.label}</span>
            <strong>{Math.round(item.score * 100)}%</strong>
            <p>{item.riskLevel}</p>
          </div>
        ))}
      </div>
      <div className="compare-footer">
        <div>
          <span>Delta</span>
          <strong className={improving ? "text-good" : worsening ? "text-warn" : ""}>
            {delta > 0 ? "+" : ""}
            {delta.toFixed(2)}
          </strong>
        </div>
        <div>
          <span>Interpretation</span>
          <strong>
            {improving
              ? "Risk is improving"
              : worsening
                ? "Risk is increasing"
                : "No change detected"}
          </strong>
        </div>
      </div>
    </div>
  );
}

function ProgressTrendChart({ history, currentScore }) {
  const points = history.map((entry, index) => ({
    label: entry.label,
    score: entry.score,
    x: 28 + (index / Math.max(history.length - 1, 1)) * 584,
    y: 212 - entry.score * 158,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const lastPoint = points[points.length - 1];
  const previousPoint = points[points.length - 2] || lastPoint;

  return (
    <div className="viz-card">
      <div className="viz-card__head">
        <div>
          <strong>Risk progression</strong>
          <p>Repeated runs chart the anomaly score across the patient journey.</p>
        </div>
        <span>{history.length} run{history.length === 1 ? "" : "s"}</span>
      </div>
      <svg viewBox="0 0 640 240" className="viz-svg" role="img" aria-label="Risk progression chart">
        <line x1="28" x2="612" y1="54" y2="54" className="viz-threshold" />
        <text x="612" y="46" className="viz-label viz-label--threshold">
          70% risk line
        </text>
        <polyline points={line} className="viz-line viz-line--progression" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.2" className="viz-point" />
            <text x={point.x} y="228" className="viz-label">
              {point.label}
            </text>
          </g>
        ))}
        {lastPoint ? <circle cx={lastPoint.x} cy={lastPoint.y} r="7" className="viz-point viz-point--current" /> : null}
        {previousPoint && previousPoint !== lastPoint ? (
          <circle cx={previousPoint.x} cy={previousPoint.y} r="6" className="viz-point viz-point--previous" />
        ) : null}
      </svg>
      <div className="viz-foot">
        <span>Current score: {currentScore}</span>
        <span>Lower score means lower anomaly risk</span>
      </div>
    </div>
  );
}

function RechartsTrendCard({ series, score, riskLevel, loading }) {
  const chartData = series.map((point, index) => ({
    label: point.label || `T${index + 1}`,
    score: point.score,
  }));

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Anomaly score trend</strong>
          <p>Recharts-powered trend view of the current run history.</p>
        </div>
        <span>{loading ? "Loading..." : riskLevel}</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="anomalyAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#72d7ff" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#72d7ff" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis dataKey="label" stroke="#9fb2ca" tickLine={false} axisLine={false} />
            <YAxis stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#9cf1d2"
              strokeWidth={3}
              fill="url(#anomalyAreaFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="viz-foot">
        <span>Latest score: {score}</span>
        <span>Trend moves with each run and reset</span>
      </div>
    </div>
  );
}

function RechartsRadarCard({ metrics, loading }) {
  const chartData = metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    full: 1,
  }));

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Clinical anomaly radar</strong>
          <p>Recharts radar view of the strongest deviation bands.</p>
        </div>
        <span>{loading ? "Loading..." : "Normalized"}</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={280}>
          <RechartsRadarChart data={chartData}>
            <PolarGrid stroke="rgba(185, 201, 225, 0.12)" />
            <PolarAngleAxis dataKey="label" tick={{ fill: "#a2b4cb", fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 1]} tick={{ fill: "#a2b4cb", fontSize: 10 }} />
            <Radar
              dataKey="value"
              stroke="#f4a261"
              fill="#f4a261"
              fillOpacity={0.22}
            />
          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>
      <div className="viz-grid">
        {chartData.map((metric) => (
          <div key={metric.label} className="viz-meter">
            <span>{metric.label}</span>
            <strong>{Math.round(metric.value * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RechartsShapCard({ features, loading }) {
  const chartData = features.map((feature) => ({
    name: feature.feature || feature.label,
    value: feature.contribution ?? feature.value ?? 0,
    direction: feature.direction || feature.sign || "positive",
  }));

  return (
    <div className="viz-card viz-card--strip">
      <div className="viz-card__head">
        <div>
          <strong>SHAP feature contributions</strong>
          <p>Bar chart view of the strongest feature drivers.</p>
        </div>
        <span>{loading ? "Loading..." : `${chartData.length} features`}</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 30 }}>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis type="number" stroke="#9fb2ca" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" stroke="#9fb2ca" tickLine={false} axisLine={false} width={110} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${entry.name}`}
                  fill={entry.direction === "negative" ? "#62d4ff" : index < 3 ? "#ff7f96" : "#9cf1d2"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function normalizeComparisonModels(models) {
  return safeArray(models).map((model, index) => {
    const score = clamp01(Number(model.score ?? model.f1 ?? model.accuracy ?? 0));
    return {
      ...model,
      score,
      band: score >= 0.7 ? "High" : score >= 0.4 ? "Medium" : "Low",
      rank: index + 1,
    };
  });
}

function getBestComparisonModel(models) {
  return [...normalizeComparisonModels(models)].sort((a, b) => b.score - a.score)[0] || null;
}

function ComparisonRiskMap({ models }) {
  const sortedModels = normalizeComparisonModels(models).sort((a, b) => b.score - a.score);
  const bandOrder = ["Low", "Medium", "High"];
  const groupedBands = bandOrder.map((band) => {
    const bandModels = sortedModels.filter((model) => model.band === band);
    const averageScore = bandModels.length
      ? bandModels.reduce((sum, model) => sum + model.score, 0) / bandModels.length
      : 0;
    return {
      band,
      models: bandModels,
      averageScore,
    };
  });

  return (
    <div className="viz-card viz-card--strip risk-map-shell">
      <div className="viz-card__head">
        <div>
          <strong>Risk map</strong>
          <p>Model-by-model anomaly spread grouped into Low, Medium, and High risk bands.</p>
        </div>
        <span>{sortedModels.length} models</span>
      </div>
      <div className="risk-map-legend">
        {groupedBands.map((band) => (
          <div key={band.band} className={`risk-map-legend__item risk-map-legend__item--${band.band.toLowerCase()}`}>
            <strong>{band.band}</strong>
            <span>{band.models.length} model{band.models.length === 1 ? "" : "s"}</span>
            <small>{band.models.length ? `${Math.round(band.averageScore * 100)}% average score` : "No models in this band"}</small>
          </div>
        ))}
      </div>
      <div className="risk-map-bands">
        {groupedBands.map((band) => (
          <section key={band.band} className={`risk-map-band risk-map-band--${band.band.toLowerCase()}`}>
            <div className="risk-map-band__head">
              <div>
                <strong>{band.band} Risk</strong>
                <p>{band.models.length ? `${band.models.length} models in this band` : "No models currently assigned"}</p>
              </div>
              <span>{band.models.length ? `${Math.round(band.averageScore * 100)}% avg` : "0%"}</span>
            </div>
            <div className="risk-map-band__tiles">
              {band.models.length ? (
                band.models.map((model) => (
                  <div key={model.key} className={`risk-map-tile risk-map-tile--${band.band.toLowerCase()}`}>
                    <div className="risk-map-tile__top">
                      <strong>{model.name}</strong>
                      <span>{Math.round(model.score * 100)}%</span>
                    </div>
                    <div className="risk-map-tile__score">{model.band}</div>
                    <div className="risk-map-tile__meta">
                      <span>F1 {Math.round((model.f1 ?? model.score) * 100)}%</span>
                      <span>{model.alert || "Stable"}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="risk-map-empty">No models landed in this band.</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ModelComparisonChart({ models }) {
  const chartData = normalizeComparisonModels(models).sort((a, b) => b.score - a.score);

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Model metric comparison</strong>
          <p>Accuracy, precision, recall, and comparative score shown side by side.</p>
        </div>
        <span>{chartData.length} models</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 10, right: 18, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis
              dataKey="name"
              stroke="#9fb2ca"
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={64}
            />
            <YAxis stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip
              formatter={(value, name) => [`${Math.round(Number(value) * 100)}%`, name]}
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Legend />
            <Bar dataKey="score" name="Comparative score" fill="#9cf1d2" radius={[8, 8, 0, 0]} />
            <Bar dataKey="precision" name="Precision" fill="#72d7ff" radius={[8, 8, 0, 0]} />
            <Bar dataKey="recall" name="Recall" fill="#f4a261" radius={[8, 8, 0, 0]} />
            <Bar dataKey="accuracy" name="Accuracy" fill="#ff7f96" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ModelComparisonTable({ models }) {
  const rows = normalizeComparisonModels(models).sort((a, b) => b.score - a.score);
  const bestKey = rows[0]?.key;

  return (
    <section className="model-comparison-table">
      <div className="viz-card__head">
        <div>
          <strong>Model comparison table</strong>
          <p>Sorted performance view with ML and DL badges for faster scanning.</p>
        </div>
        <span>{rows.length} models</span>
      </div>
      <div className="model-comparison-table__wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Model</th>
              <th>Family</th>
              <th>Score</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>F1</th>
              <th>Latency</th>
              <th>Memory</th>
              <th>Band</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((model, index) => (
              <tr key={model.key} className={model.key === bestKey ? "is-best" : ""}>
                <td>{index + 1}</td>
                <td>
                  <strong>{model.name}</strong>
                  <span>{model.variantLabel}</span>
                </td>
                <td>
                  <ModelFamilyBadge family={model.family} label={model.familyLabel} />
                </td>
                <td>{Math.round((model.score ?? 0) * 100)}%</td>
                <td>{Math.round((model.precision ?? model.score ?? 0) * 100)}%</td>
                <td>{Math.round((model.recall ?? model.score ?? 0) * 100)}%</td>
                <td>{Math.round((model.f1 ?? model.score ?? 0) * 100)}%</td>
                <td>{model.latencyMs ?? "N/A"} ms</td>
                <td>{model.memoryMb ?? "N/A"} MB</td>
                <td>{model.band}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoreHistogramCard({ history, currentScore, loading }) {
  const chartData = history.length
    ? history.map((entry, index) => ({
        run: entry.label || `Run ${index + 1}`,
        score: clamp01(Number(entry.score ?? 0)),
      }))
    : [{ run: "Current", score: clamp01(Number(currentScore || 0)) }];

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Score histogram</strong>
          <p>Histogram of the latest anomaly score runs. First visit shows a single bar.</p>
        </div>
        <span>{loading ? "Loading..." : `${chartData.length} run${chartData.length === 1 ? "" : "s"}`}</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 8, right: 20, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis dataKey="run" stroke="#9fb2ca" tickLine={false} axisLine={false} />
            <YAxis stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Bar dataKey="score" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`hist-${entry.run}`} fill={index === chartData.length - 1 ? "#9cf1d2" : "#62d4ff"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HistogramSeedCard({ currentScore }) {
  const seedScore = Math.max(0.08, clamp01(Number(currentScore || 0)));
  const chartData = [
    {
      run: "Current",
      score: seedScore,
    },
  ];

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Score histogram</strong>
          <p>First visit shows a single bar so the score is visible before reruns accumulate.</p>
        </div>
        <span>1 run</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 8, right: 20, bottom: 8, left: 4 }}>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis dataKey="run" stroke="#9fb2ca" tickLine={false} axisLine={false} />
            <YAxis stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Bar dataKey="score" radius={[8, 8, 0, 0]}>
              <Cell fill="#9cf1d2" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="viz-foot">
        <span>Baseline seed: {Math.round(seedScore * 100)}%</span>
        <span>First visit histogram</span>
      </div>
    </div>
  );
}

function AnomalyTimelineCard({ series, loading, currentScore }) {
  const chartData = series.length
    ? series.map((point, index) => ({
        label: point.label || `T${index + 1}`,
        score: clamp01(Number(point.score ?? 0)),
      }))
    : [
        {
          label: "Current",
          score: Math.max(0.08, clamp01(Number(currentScore || 0))),
        },
      ];
  const isSeeded = series.length === 0;
  const latestScore = chartData[chartData.length - 1]?.score ?? 0;

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Anomaly score timeline</strong>
          <p>
            {isSeeded
              ? "First visit shows a seeded point so the timeline is visible before the first run."
              : "Trend over the patient flow, rendered as an area chart."}
          </p>
        </div>
        <span>{loading ? "Loading..." : isSeeded ? "Seeded" : "Timeline"}</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="timelineAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f4a261" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f4a261" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis dataKey="label" stroke="#9fb2ca" tickLine={false} axisLine={false} />
            <YAxis stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <Tooltip
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Area type="monotone" dataKey="score" stroke="#f4a261" strokeWidth={3} fill="url(#timelineAreaFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="viz-foot">
        <span>Latest score: {Math.round(latestScore * 100)}%</span>
      <span>{isSeeded ? "Single-point baseline" : "Trend moves with each run and reset"}</span>
      </div>
    </div>
  );
}

function PipelineTimelineCard({ stages }) {
  const timelineStages = safeArray(stages);

  return (
    <section className="pipeline-timeline">
      <div className="viz-card__head">
        <div>
          <strong>Pipeline timeline</strong>
          <p>Each stage shows where the bundle sits in the feature engineering path.</p>
        </div>
        <span>{timelineStages.length} stages</span>
      </div>
      <div className="pipeline-timeline__list">
        {timelineStages.map((stage, index) => (
          <article key={stage.name} className={`pipeline-timeline__item pipeline-timeline__item--${stage.status}`}>
            <div className="pipeline-timeline__index">{String(index + 1).padStart(2, "0")}</div>
            <div className="pipeline-timeline__body">
              <div className="pipeline-timeline__head">
                <div>
                  <strong>{stage.name}</strong>
                  <p>{stage.detail}</p>
                </div>
                <span className={`pipeline-timeline__badge pipeline-timeline__badge--${stage.status}`}>{stage.status}</span>
              </div>
              <div className="pipeline-timeline__meta">
                <span>{stage.outputCount} outputs</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelFamilyBadge({ family, label }) {
  const familyName = String(family || "").toLowerCase();
  return (
    <span className={`model-family-badge model-family-badge--${familyName}`}>
      {label || family || "Model"}
    </span>
  );
}

function ModelHubFamilyCard({ title, models, family, description }) {
  const sortedModels = [...safeArray(models)].sort((a, b) => (b.f1 ?? b.score ?? 0) - (a.f1 ?? a.score ?? 0));
  const bestModel = sortedModels[0] || null;

  return (
    <section className={`model-hub-family model-hub-family--${family.toLowerCase()}`}>
      <div className="section-card__head">
        <div>
          <p className="eyebrow">{family}</p>
          <h3>{title}</h3>
        </div>
        <p className="section-card__description">{description}</p>
      </div>
      <div className="model-hub-family__summary">
        <div>
          <span>Models</span>
          <strong>{sortedModels.length}</strong>
        </div>
        <div>
          <span>Best F1</span>
          <strong>{bestModel ? `${Math.round((bestModel.f1 ?? bestModel.score ?? 0) * 100)}%` : "N/A"}</strong>
        </div>
        <div>
          <span>Best model</span>
          <strong>{bestModel?.name || "N/A"}</strong>
        </div>
      </div>
      <div className="model-hub-family__list">
        {sortedModels.map((model) => (
          <article key={model.key} className="model-hub-card">
            <div className="model-hub-card__head">
              <div>
                <strong>{model.name}</strong>
                <p>{model.variantLabel}</p>
              </div>
              <ModelFamilyBadge family={model.family} label={model.familyLabel} />
            </div>
            <div className="model-hub-card__score">{Math.round((model.f1 ?? model.score ?? 0) * 100)}%</div>
            <div className="model-hub-card__metrics">
              <span>Accuracy {Math.round((model.accuracy ?? model.score ?? 0) * 100)}%</span>
              <span>Latency {model.latencyMs ?? "N/A"} ms</span>
              <span>Memory {model.memoryMb ?? "N/A"} MB</span>
              <span>AUC {Math.round((model.auc ?? model.score ?? 0) * 100)}%</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelHubOverview({ groups, activeModel }) {
  const overallBest = [...groups.catalog].sort((a, b) => (b.f1 ?? b.score ?? 0) - (a.f1 ?? a.score ?? 0))[0] || null;

  return (
    <div className="model-hub-overview">
      <div className="viz-card__head">
        <div>
          <strong>Trained model hub</strong>
          <p>All trained models are organized by family so the ML and DL branches are easy to compare.</p>
        </div>
        <span>{groups.allCount} trained models</span>
      </div>
      <div className="model-hub-overview__grid">
        <div className="model-hub-overview__item">
          <span>Model in use</span>
          <strong>{activeModel}</strong>
        </div>
        <div className="model-hub-overview__item">
          <span>Primary model</span>
          <strong>{overallBest?.name || "N/A"}</strong>
        </div>
        <div className="model-hub-overview__item">
          <span>ML models</span>
          <strong>{groups.mlCount}</strong>
        </div>
        <div className="model-hub-overview__item">
          <span>DL models</span>
          <strong>{groups.dlCount}</strong>
        </div>
      </div>
      <div className="model-hub-overview__list">
        {groups.catalog.map((model) => (
          <div key={model.key} className="model-hub-overview__chip">
            <span>{model.name}</span>
            <ModelFamilyBadge family={model.family} label={model.family} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelHubExplainabilityCard({ activeModel, primaryModel, modelResults }) {
  const attributionSource = modelResults?.shapSummary?.length ? modelResults.shapSummary : modelResults?.featureAttributions || [];
  const explanationSignals = normalizeShapValues(attributionSource).slice(0, 5);
  const strongestSignal = explanationSignals[0] || null;
  const scoreLead = activeModel && primaryModel ? (primaryModel.f1 ?? primaryModel.score ?? 0) - (activeModel.f1 ?? activeModel.score ?? 0) : 0;
  const explanationNote = explanationSignals.length
    ? "Current patient-level attributions are available from the latest analysis run."
    : "No patient-level attribution bundle is loaded yet, so the hub is showing model-level justification.";

  return (
    <section className="model-hub-explainability">
      <div className="viz-card__head">
        <div>
          <strong>Explainability</strong>
          <p>Why the selected model is trusted, and which signals currently matter most.</p>
        </div>
        <span>{strongestSignal ? "Live attributions" : "Model rationale"}</span>
      </div>
      <div className="model-hub-explainability__summary">
        <div className="model-hub-explainability__summary-item">
          <span>Selected model</span>
          <strong>{activeModel?.name || "N/A"}</strong>
        </div>
        <div className="model-hub-explainability__summary-item">
          <span>Primary model</span>
          <strong>{primaryModel?.name || "N/A"}</strong>
        </div>
        <div className="model-hub-explainability__summary-item">
          <span>F1 lead</span>
          <strong>{`${scoreLead >= 0 ? "+" : ""}${Math.round(scoreLead * 100)}%`}</strong>
        </div>
        <div className="model-hub-explainability__summary-item">
          <span>Latency</span>
          <strong>{activeModel?.latencyMs ?? "N/A"} ms</strong>
        </div>
      </div>
      <div className="model-hub-explainability__signals">
        {explanationSignals.length ? (
          explanationSignals.map((signal) => (
            <div key={signal.feature} className="model-hub-explainability__signal">
              <div className="model-hub-explainability__signal-head">
                <span>{signal.feature}</span>
                <strong>{Math.round((signal.contribution ?? 0) * 100)}%</strong>
              </div>
              <div className="model-hub-explainability__bar-track" aria-hidden="true">
                <div
                  className={`model-hub-explainability__bar model-hub-explainability__bar--${signal.direction === "negative" ? "negative" : "positive"}`}
                  style={{ width: `${Math.max(8, Math.round((signal.contribution ?? 0) * 100))}%` }}
                />
              </div>
              <p>
                {signal.direction === "negative" ? "Suppressing" : "Amplifying"} the decision with a raw value of{" "}
                {signal.value === "" || signal.value === null || signal.value === undefined ? "N/A" : signal.value}
                .
              </p>
            </div>
          ))
        ) : (
          <div className="model-hub-explainability__empty">
            <strong>Waiting for analysis output</strong>
            <p>
              Run the comparative analysis page to populate feature attributions and reveal the strongest patient-level drivers.
            </p>
          </div>
        )}
      </div>
      <p className="model-hub-explainability__note">{explanationNote}</p>
    </section>
  );
}

function DecisionConsensusCard({ models }) {
  const sortedModels = normalizeComparisonModels(models).sort((a, b) => b.score - a.score);
  const topModels = sortedModels.slice(0, 4);
  const consensusScore = topModels.length
    ? topModels.reduce((sum, model) => sum + model.score, 0) / topModels.length
    : 0;
  const scoreSpread = topModels.length > 1 ? topModels[0].score - topModels[topModels.length - 1].score : 0;
  const dominantBand = topModels.filter((model) => model.band === "High").length >= 2
    ? "High"
    : topModels.filter((model) => model.band === "Medium").length >= 2
      ? "Medium"
      : "Low";

  return (
    <div className="decision-consensus-card">
      <div className="viz-card__head">
        <div>
          <strong>Model consensus display</strong>
          <p>Top models are grouped to show how strongly the ensemble agrees on the current decision.</p>
        </div>
        <span>{Math.round(consensusScore * 100)}% consensus</span>
      </div>
      <div className="decision-consensus-card__metrics">
        <div className="decision-metric">
          <span>Consensus score</span>
          <strong>{Math.round(consensusScore * 100)}%</strong>
        </div>
        <div className="decision-metric">
          <span>Score spread</span>
          <strong>{Math.round(scoreSpread * 100)}%</strong>
        </div>
        <div className="decision-metric">
          <span>Dominant band</span>
          <strong>{dominantBand}</strong>
        </div>
        <div className="decision-metric">
          <span>Top model</span>
          <strong>{topModels[0]?.name || "Locked"}</strong>
        </div>
      </div>
      <div className="consensus-strip">
        {topModels.map((model) => (
          <div key={model.key} className="consensus-chip">
            <span>{model.name}</span>
            <strong>{Math.round(model.score * 100)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionRiskMap({ models }) {
  const sortedModels = normalizeComparisonModels(models).sort((a, b) => b.score - a.score);
  const width = 640;
  const height = 280;
  const padding = 40;
  const latencies = sortedModels.map((model) => Number(model.latencyMs ?? 0)).filter(Number.isFinite);
  const memoryValues = sortedModels.map((model) => Number(model.memoryMb ?? 0)).filter(Number.isFinite);
  const minLatency = Math.min(...latencies, 0);
  const maxLatency = Math.max(...latencies, 1);
  const minMemory = Math.min(...memoryValues, 0);
  const maxMemory = Math.max(...memoryValues, 1);

  const points = sortedModels.map((model) => {
    const latency = Number(model.latencyMs ?? 0);
    const memory = Number(model.memoryMb ?? 0);
    const x = padding + ((latency - minLatency) / Math.max(maxLatency - minLatency, 1)) * (width - padding * 2);
    const scoreY = height - padding - model.score * (height - padding * 2);
    const y = scoreY;
    const radius = 7 + clamp01(memory / Math.max(maxMemory, 1)) * 7;
    return {
      ...model,
      x,
      y,
      radius,
    };
  });

  return (
    <div className="decision-risk-map">
      <div className="viz-card__head">
        <div>
          <strong>Risk map</strong>
          <p>Latency and score are plotted together so the safest operational choice stands out.</p>
        </div>
        <span>{sortedModels.length} models</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg decision-risk-map__svg" role="img" aria-label="Decision support risk map">
        <defs>
          <linearGradient id="decisionRiskFillLow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(143,241,207,0.9)" />
            <stop offset="100%" stopColor="rgba(143,241,207,0.4)" />
          </linearGradient>
          <linearGradient id="decisionRiskFillMedium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,203,109,0.9)" />
            <stop offset="100%" stopColor="rgba(255,203,109,0.4)" />
          </linearGradient>
          <linearGradient id="decisionRiskFillHigh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,127,150,0.9)" />
            <stop offset="100%" stopColor="rgba(255,127,150,0.4)" />
          </linearGradient>
        </defs>
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} className="viz-threshold" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} className="viz-threshold" />
        <text x={width - padding} y={height - 12} className="viz-label viz-label--threshold">
          Latency
        </text>
        <text x={14} y={padding + 4} className="viz-label viz-label--axis">
          Score
        </text>
        {points.map((point) => {
          const fill =
            point.band === "High"
              ? "url(#decisionRiskFillHigh)"
              : point.band === "Medium"
                ? "url(#decisionRiskFillMedium)"
                : "url(#decisionRiskFillLow)";
          return (
            <g key={point.key}>
              <circle cx={point.x} cy={point.y} r={point.radius} fill={fill} stroke="rgba(7,17,29,0.9)" strokeWidth="2" />
              <text x={point.x} y={Math.max(18, point.y - point.radius - 10)} className="viz-label decision-risk-map__label">
                {point.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="decision-risk-map__legend">
        <span>Low risk = green</span>
        <span>Medium risk = amber</span>
        <span>High risk = red</span>
        <span>Bubble size reflects memory</span>
      </div>
      <div className="decision-risk-map__stats">
        <div>
          <span>Latency range</span>
          <strong>
            {Number.isFinite(minLatency) ? minLatency.toFixed(1) : "0.0"} to {Number.isFinite(maxLatency) ? maxLatency.toFixed(1) : "0.0"} ms
          </strong>
        </div>
        <div>
          <span>Memory range</span>
          <strong>
            {Number.isFinite(minMemory) ? Math.round(minMemory) : 0} to {Number.isFinite(maxMemory) ? Math.round(maxMemory) : 0} MB
          </strong>
        </div>
      </div>
    </div>
  );
}

function FeatureEngineeringChart({ features }) {
  const chartData = safeArray(features).map((feature, index) => ({
    name: feature.name || feature.label || `Feature ${index + 1}`,
    value: clamp01(Number(feature.value ?? feature.contribution ?? 0)),
    group: feature.group || feature.category || "Clinical",
  }));

  return (
    <div className="viz-card viz-card--recharts">
      <div className="viz-card__head">
        <div>
          <strong>Feature engineering output</strong>
          <p>Derived features are normalized so the backend can score them consistently.</p>
        </div>
        <span>{chartData.length} features</span>
      </div>
      <div className="recharts-box">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 24 }}>
            <CartesianGrid stroke="rgba(185, 201, 225, 0.12)" strokeDasharray="4 4" />
            <XAxis type="number" stroke="#9fb2ca" tickLine={false} axisLine={false} domain={[0, 1]} />
            <YAxis type="category" dataKey="name" stroke="#9fb2ca" tickLine={false} axisLine={false} width={130} />
            <Tooltip
              formatter={(value, name, entry) => [`${Math.round(Number(value) * 100)}%`, entry.payload.group || name]}
              contentStyle={{
                background: "rgba(10, 17, 29, 0.96)",
                border: "1px solid rgba(185, 201, 225, 0.18)",
                borderRadius: 12,
                color: "#edf3fb",
              }}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`feature-${entry.name}`}
                  fill={index < 2 ? "#9cf1d2" : index < 4 ? "#72d7ff" : index < 6 ? "#f4a261" : "#ff7f96"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

async function submitClinicianFeedback(payload) {
  try {
    const response = await axios.post("/feedback", payload);
    return {
      source: "api",
      data: response.data,
    };
  } catch (error) {
    if (typeof window !== "undefined" && window.localStorage) {
      const key = "clinician-feedback-submissions";
      const existing = JSON.parse(window.localStorage.getItem(key) || "[]");
      const record = {
        ...payload,
        submittedAt: new Date().toISOString(),
        source: "local",
      };
      existing.unshift(record);
      window.localStorage.setItem(key, JSON.stringify(existing.slice(0, 10)));
      return {
        source: "local",
        data: record,
      };
    }

    throw error;
  }
}

function buildFeatureEngineeringPipeline(patient) {
  const labs = patient.labs || {};
  const measurements = patient.measurements || {};
  const demographics = patient.demographics || {};

  const rawFields = [...Object.values(labs), ...Object.values(measurements)];
  const missingCount = rawFields.filter((value) => String(value ?? "").trim() === "").length;

  const parsed = {
    fastingGlucose: parseNumeric(labs.fastingGlucose),
    postprandialGlucose: parseNumeric(labs.postprandialGlucose),
    hba1c: parseNumeric(labs.hba1c),
    hemoglobin: parseNumeric(labs.hemoglobin),
    wbcCount: parseNumeric(labs.wbcCount),
    plateletCount: parseNumeric(labs.plateletCount),
    ldl: parseNumeric(labs.ldl),
    hdl: parseNumeric(labs.hdl),
    triglycerides: parseNumeric(labs.triglycerides),
    ast: parseNumeric(labs.ast),
    alt: parseNumeric(labs.alt),
    bilirubin: parseNumeric(labs.bilirubin),
    albumin: parseNumeric(labs.albumin),
    creatinine: parseNumeric(labs.creatinine),
    urea: parseNumeric(labs.urea),
    egfr: parseNumeric(labs.egfr),
    sodium: parseNumeric(labs.sodium),
    potassium: parseNumeric(labs.potassium),
    chloride: parseNumeric(labs.chloride),
    bicarbonate: parseNumeric(labs.bicarbonate),
    heartRate: parseNumeric(measurements.heartRate),
    systolicBp: parseNumeric(measurements.systolicBp),
    diastolicBp: parseNumeric(measurements.diastolicBp),
    spo2: parseNumeric(measurements.spo2),
    temperature: parseNumeric(measurements.temperature),
    respiratoryRate: parseNumeric(measurements.respiratoryRate),
    weight: parseNumeric(measurements.weight),
    height: parseNumeric(measurements.height),
  };

  const engineeredFeatures = [
    {
      name: "Glycemic pressure",
      value: clamp01(((parsed.fastingGlucose - 70) / 60 + (parsed.postprandialGlucose - 140) / 120 + (parsed.hba1c - 5.6) / 4) / 3 + 0.25),
      group: "Metabolic",
      source: "fasting glucose, postprandial glucose, HbA1c",
    },
    {
      name: "Glucose gap",
      value: clamp01(Math.abs(parsed.postprandialGlucose - parsed.fastingGlucose) / 180),
      group: "Interaction",
      source: "postprandial glucose - fasting glucose",
    },
    {
      name: "Blood pressure strain",
      value: clamp01(((parsed.systolicBp - 120) / 40 + (parsed.diastolicBp - 80) / 20) / 2 + 0.25),
      group: "Vitals",
      source: "systolic BP, diastolic BP",
    },
    {
      name: "Oxygen reserve",
      value: clamp01((100 - parsed.spo2) / 10),
      group: "Vitals",
      source: "SpO2",
    },
    {
      name: "Renal burden",
      value: clamp01(((parsed.creatinine - 0.9) / 1.5 + (parsed.urea - 20) / 40 + (90 - parsed.egfr) / 60) / 3 + 0.15),
      group: "Renal",
      source: "creatinine, urea, eGFR",
    },
    {
      name: "Electrolyte drift",
      value: clamp01(
        (Math.abs(parsed.sodium - 140) / 10 +
          Math.abs(parsed.potassium - 4.2) / 2 +
          Math.abs(parsed.chloride - 103) / 8 +
          Math.abs(parsed.bicarbonate - 25) / 8) /
          4,
      ),
      group: "Chemistry",
      source: "sodium, potassium, chloride, bicarbonate",
    },
    {
      name: "Hematology stress",
      value: clamp01(((14 - parsed.hemoglobin) / 4 + (parsed.wbcCount - 7) / 8 + (parsed.plateletCount - 250) / 250) / 3 + 0.2),
      group: "Hematology",
      source: "hemoglobin, WBC count, platelet count",
    },
    {
      name: "Liver load",
      value: clamp01(
        ((parsed.ast - 25) / 25 + (parsed.alt - 30) / 35 + (parsed.bilirubin - 0.8) / 1.2 + (4.2 - parsed.albumin) / 1.2) / 4 + 0.2,
      ),
      group: "Hepatic",
      source: "AST, ALT, bilirubin, albumin",
    },
    {
      name: "Body size proxy",
      value: clamp01((parsed.weight / Math.max(parsed.height, 1)) / 2),
      group: "Anthropometric",
      source: "weight, height",
    },
  ].map((feature) => ({
    ...feature,
    value: clamp01(feature.value),
  }));

  const categoricalSources = {
    sex: String(demographics.sex || "Unknown"),
    locationType: String(demographics.locationType || "Unknown"),
    triagePriority: String(patient.visit?.triagePriority || "Routine"),
  };

  const encodedFeatures = [
    {
      name: `sex_${categoricalSources.sex.toLowerCase()}`,
      value: clamp01(
        categoricalSources.sex === "Female" ? 1 : categoricalSources.sex === "Male" ? 0.82 : 0.5,
      ),
      group: "Encoding",
      source: "patient demographics sex",
    },
    {
      name: `location_${categoricalSources.locationType.toLowerCase()}`,
      value: clamp01(
        categoricalSources.locationType === "Clinic" ? 0.68 : categoricalSources.locationType === "Home" ? 0.4 : 0.85,
      ),
      group: "Encoding",
      source: "visit location type",
    },
    {
      name: `triage_${categoricalSources.triagePriority.toLowerCase()}`,
      value: clamp01(
        categoricalSources.triagePriority === "Urgent"
          ? 1
          : categoricalSources.triagePriority === "Priority"
            ? 0.8
            : categoricalSources.triagePriority === "Routine"
              ? 0.45
              : 0.2,
      ),
      group: "Encoding",
      source: "triage priority",
    },
    {
      name: `age_band_${Number(demographics.age || 0) >= 60 ? "senior" : Number(demographics.age || 0) >= 35 ? "adult" : "young"}`,
      value: clamp01(Number(demographics.age || 0) / 100),
      group: "Encoding",
      source: "age band",
    },
  ];

  const stages = [
    {
      name: "Raw intake",
      status: "complete",
      detail: "Patient measurements and labs are captured in their raw form.",
      outputCount: rawFields.length,
    },
    {
      name: "Clean & validate",
      status: missingCount === 0 ? "complete" : "warning",
      detail: "Missing values are flagged before the pipeline continues.",
      outputCount: rawFields.length - missingCount,
    },
    {
      name: "Normalize",
      status: "complete",
      detail: "Numeric inputs are scaled into comparable clinical bands.",
      outputCount: 28,
    },
    {
      name: "Encode categories",
      status: "complete",
      detail: "Categorical fields are encoded into model-friendly numeric signals.",
      outputCount: encodedFeatures.length,
    },
    {
      name: "Engineer features",
      status: "complete",
      detail: "Interaction and domain-specific features are derived for model input.",
      outputCount: engineeredFeatures.length,
    },
    {
      name: "Bundle for scoring",
      status: "ready",
      detail: "The final feature bundle is ready for the backend model hub.",
      outputCount: engineeredFeatures.length + encodedFeatures.length + 4,
    },
  ];

  const featureBundleCount = engineeredFeatures.length + encodedFeatures.length;
  const estimatedLatencyMs = Math.round(18 + featureBundleCount * 1.8 + missingCount * 2.4);
  const estimatedThroughput = Math.round(Math.max(18, 1200 / Math.max(estimatedLatencyMs, 1)));
  const estimatedBundleSizeKb = Math.round(42 + featureBundleCount * 3.6 + missingCount * 1.2);
  const estimatedMemoryMb = Math.round(62 + featureBundleCount * 1.7);

  return {
    rawCount: rawFields.length,
    missingCount,
    cleanedCount: rawFields.length - missingCount,
    engineeredCount: engineeredFeatures.length,
    encodedCount: encodedFeatures.length,
    featureBundleCount,
    estimatedLatencyMs,
    estimatedThroughput,
    estimatedBundleSizeKb,
    estimatedMemoryMb,
    stages,
    encodedFeatures,
    engineeredFeatures,
    pipelineStatus: missingCount === 0 ? "Ready for scoring" : "Validation warning",
  };
}

function categorizeTrainedModel(model) {
  const name = String(model.name || "").toLowerCase();
  const key = String(model.key || "").toLowerCase();
  const isDeep =
    name.includes("autoencoder") ||
    name.includes("deep svdd") ||
    name.includes("transformer") ||
    name.includes("ganomaly") ||
    name.includes("cnn") ||
    name.includes("variational");
  const isHybrid = key === "ensemble" || name.includes("ensemble");

  return {
    ...model,
    family: isDeep ? "DL" : "ML",
    familyLabel: isDeep ? "Deep Learning" : "Machine Learning",
    variantLabel: isHybrid ? "Hybrid ensemble" : "Trained model",
  };
}

function getModelHubGroups() {
  const catalog = analysisModelCatalog.map(categorizeTrainedModel);
  const ml = catalog.filter((model) => model.family === "ML");
  const dl = catalog.filter((model) => model.family === "DL");

  return {
    catalog,
    ml,
    dl,
    allCount: catalog.length,
    mlCount: ml.length,
    dlCount: dl.length,
  };
}

function findLabField(key) {
  return labFieldSpecs.find((field) => field.key === key);
}

function formatRangeHint(field, value) {
  if (!field || value === "" || Number.isNaN(Number(value))) {
    return "";
  }

  const numeric = Number(value);
  const ranges = {
    fastingGlucose: [70, 99],
    postprandialGlucose: [0, 140],
    hba1c: [4.0, 5.6],
    hemoglobin: [12.0, 17.5],
    wbcCount: [4.0, 11.0],
    plateletCount: [150, 450],
    ldl: [0, 100],
    hdl: [40, Infinity],
    triglycerides: [0, 150],
    ast: [10, 40],
    alt: [7, 56],
    bilirubin: [0.1, 1.2],
    albumin: [3.5, 5.0],
    creatinine: [0.6, 1.3],
    urea: [7, 20],
    egfr: [90, Infinity],
    sodium: [135, 145],
    potassium: [3.5, 5.1],
    chloride: [98, 107],
    bicarbonate: [22, 29],
  };

  const range = ranges[field.key];
  if (!range) {
    return field.hint;
  }

  const [low, high] = range;
  if (high === Infinity) {
    return numeric >= low ? `Normal: > ${low}` : field.hint;
  }

  return `Normal: ${low}-${high}`;
}

function LabField({ field, register, error, value, onAutoFill }) {
  const registration = register(field.key);
  const hint = formatRangeHint(field, value);
  const withinRange = (() => {
    if (value === "" || Number.isNaN(Number(value))) {
      return null;
    }
    const numeric = Number(value);
    const ranges = {
      fastingGlucose: [70, 99],
      postprandialGlucose: [0, 140],
      hba1c: [4.0, 5.6],
      hemoglobin: [12.0, 17.5],
      wbcCount: [4.0, 11.0],
      plateletCount: [150, 450],
      ldl: [0, 100],
      hdl: [40, Infinity],
      triglycerides: [0, 150],
      ast: [10, 40],
      alt: [7, 56],
      bilirubin: [0.1, 1.2],
      albumin: [3.5, 5.0],
      creatinine: [0.6, 1.3],
      urea: [7, 20],
      egfr: [90, Infinity],
      sodium: [135, 145],
      potassium: [3.5, 5.1],
      chloride: [98, 107],
      bicarbonate: [22, 29],
    };
    const range = ranges[field.key];
    if (!range) return null;
    const [low, high] = range;
    if (high === Infinity) return numeric >= low;
    return numeric >= low && numeric <= high;
  })();

  return (
    <label className={`lab-field${error ? " lab-field--error" : ""}`}>
      <span className="lab-field__label">{field.label}</span>
      <input
        type="number"
        step="any"
        placeholder={field.defaultValue}
        {...registration}
        onChange={(event) => {
          registration.onChange(event);
          if (onAutoFill) {
            onAutoFill(field.key, event.target.value);
          }
        }}
      />
      <div className="lab-field__meta">
        <span className={`lab-range${withinRange === null ? "" : withinRange ? " is-good" : " is-warn"}`}>
          {hint}
        </span>
        {field.unit ? <span className="lab-unit">{field.unit}</span> : null}
      </div>
      {error ? <span className="lab-field__error">{error.message}</span> : null}
    </label>
  );
}

function emptyLabRecord() {
  return Object.fromEntries(labFieldSpecs.map((field) => [field.key, ""]));
}

function mapParsedLabValues(source) {
  const normalized = {};
  const entries = source instanceof Map ? Array.from(source.entries()) : Object.entries(source || {});

  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey).trim().toLowerCase();
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const stringValue = value == null ? "" : String(value).trim();
    if (!stringValue) {
      continue;
    }

    for (const field of labFieldSpecs) {
      const matchesKey =
        field.key.toLowerCase() === key ||
        field.label.toLowerCase() === key ||
        field.aliases.some((alias) => alias.toLowerCase() === key);
      if (matchesKey) {
        normalized[field.key] = stringValue;
      }
    }
  }

  return normalized;
}

function parseLabText(text) {
  const normalized = {};
  const lowerText = text.toLowerCase();

  for (const field of labFieldSpecs) {
    const aliasPattern = field.aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(
      `(?:${aliasPattern})\\s*(?:[:=\\-]|is|value)?\\s*([-+]?\\d+(?:\\.\\d+)?)`,
      "i",
    );
    const match = lowerText.match(regex);
    if (match?.[1]) {
      normalized[field.key] = match[1];
    }
  }

  return normalized;
}

async function parsePdfFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => item.str).join(" ")}\n`;
  }

  return parseLabText(text);
}

async function parseCsvFile(file) {
  const text = await file.text();
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          reject(new Error(results.errors[0].message));
          return;
        }

        const rows = results.data || [];
        if (!rows.length) {
          resolve({});
          return;
        }

        const firstRow = rows[0];
        const headerValues = mapParsedLabValues(firstRow);
        if (Object.keys(headerValues).length) {
          resolve(headerValues);
          return;
        }

        const kvPairs = {};
        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length >= 2) {
            kvPairs[row[keys[0]]] = row[keys[1]];
          }
        }
        resolve(mapParsedLabValues(kvPairs));
      },
      error: (error) => reject(error),
    });
  });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseNumeric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function deviationFromRange(value, min, max) {
  const numeric = parseNumeric(value);
  if (numeric >= min && numeric <= max) {
    return 0;
  }
  if (numeric < min) {
    return clamp01((min - numeric) / Math.max(min, 1));
  }
  return clamp01((numeric - max) / Math.max(max, 1));
}

function computeAnalysisResults(patient, priorHistory = []) {
  const labs = patient.labs;
  const measurements = patient.measurements;

  const severitySignals = [
    deviationFromRange(labs.fastingGlucose, 70, 99),
    deviationFromRange(labs.postprandialGlucose, 0, 140),
    deviationFromRange(labs.hba1c, 4.0, 5.6),
    deviationFromRange(labs.hemoglobin, 12.0, 17.5),
    deviationFromRange(labs.wbcCount, 4.0, 11.0),
    deviationFromRange(labs.plateletCount, 150, 450),
    deviationFromRange(labs.ldl, 0, 100),
    deviationFromRange(labs.hdl, 40, Infinity),
    deviationFromRange(labs.triglycerides, 0, 150),
    deviationFromRange(labs.ast, 10, 40),
    deviationFromRange(labs.alt, 7, 56),
    deviationFromRange(labs.bilirubin, 0.1, 1.2),
    deviationFromRange(labs.albumin, 3.5, 5.0),
    deviationFromRange(labs.creatinine, 0.6, 1.3),
    deviationFromRange(labs.urea, 7, 20),
    deviationFromRange(labs.egfr, 90, Infinity),
    deviationFromRange(labs.sodium, 135, 145),
    deviationFromRange(labs.potassium, 3.5, 5.1),
    deviationFromRange(labs.chloride, 98, 107),
    deviationFromRange(labs.bicarbonate, 22, 29),
    deviationFromRange(measurements.spo2, 95, 100),
    deviationFromRange(measurements.temperature, 36.1, 37.2),
    deviationFromRange(measurements.heartRate, 60, 100),
    deviationFromRange(measurements.systolicBp, 90, 140),
    deviationFromRange(measurements.diastolicBp, 60, 90),
  ];

  const totalDeviation = severitySignals.reduce((sum, value) => sum + value, 0);
  const overallScore = clamp01(0.22 + totalDeviation / 18);
  const riskLevel = overallScore >= 0.7 ? "High" : overallScore >= 0.4 ? "Medium" : "Low";
  const primaryModel = analysisModelCatalog.reduce((best, model) => (model.f1 > best.f1 ? model : best), analysisModelCatalog[0]);

  const modelRows = analysisModelCatalog.map((model, index) => {
    const offset = (overallScore - 0.4) * 0.12 - index * 0.006;
    return {
      ...model,
      score: clamp01(model.f1 + offset),
      alert: index === analysisModelCatalog.length - 1 ? riskLevel : model.f1 > 0.84 ? "Stable" : "Review",
    };
  });

  const performanceSeries = modelRows.map((row) => ({
    label: row.name,
    accuracy: row.accuracy,
    precision: row.precision,
    recall: row.recall,
    score: row.score,
    latencyMs: row.latencyMs,
    memoryMb: row.memoryMb,
  }));

  const featureAttributions = [
    { feature: "HbA1c", value: parseNumeric(labs.hba1c), weight: 0.22, direction: "positive" },
    { feature: "Postprandial glucose", value: parseNumeric(labs.postprandialGlucose), weight: 0.18, direction: "positive" },
    { feature: "Fasting glucose", value: parseNumeric(labs.fastingGlucose), weight: 0.16, direction: "positive" },
    { feature: "SpO2", value: parseNumeric(measurements.spo2), weight: 0.11, direction: "negative" },
    { feature: "Hemoglobin", value: parseNumeric(labs.hemoglobin), weight: 0.08, direction: "negative" },
    { feature: "Creatinine", value: parseNumeric(labs.creatinine), weight: 0.07, direction: "positive" },
    { feature: "Systolic BP", value: parseNumeric(measurements.systolicBp), weight: 0.06, direction: "positive" },
    { feature: "Sodium", value: parseNumeric(labs.sodium), weight: 0.05, direction: "positive" },
    { feature: "HDL", value: parseNumeric(labs.hdl), weight: 0.04, direction: "negative" },
  ]
    .map((entry) => ({
      ...entry,
      contribution: clamp01(entry.weight + (overallScore - 0.5) * 0.08),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const shapSummary = featureAttributions.slice(0, 6).map((entry, index) => ({
    ...entry,
    sign: index % 2 === 0 ? "positive" : "negative",
  }));

  const summaryPoints = [
    `Overall anomaly score settled at ${overallScore.toFixed(2)}.`,
    `${primaryModel.name} remains the strongest single detector by F1.`,
    `${riskLevel} risk band unlocked after the test run.`,
    `${featureAttributions[0].feature} and ${featureAttributions[1].feature} are the strongest drivers.`,
  ];

  const trendBase = clamp(overallScore, 0.05, 0.98);
  const trendSeries = Array.from({ length: 8 }, (_, index) => {
    const wobble = Math.sin(index * 0.9) * 0.06 + Math.cos(index * 0.35) * 0.03;
    return {
      label: `T${index + 1}`,
      score: clamp(trendBase + wobble + (index - 3) * 0.01, 0.04, 0.98),
    };
  });

  const radarMetrics = [
    {
      label: "Diabetes",
      value: clamp(
        (deviationFromRange(labs.fastingGlucose, 70, 99) + deviationFromRange(labs.postprandialGlucose, 0, 140) + deviationFromRange(labs.hba1c, 4.0, 5.6)) / 3,
        0,
        1,
      ),
    },
    {
      label: "Blood",
      value: clamp(
        (deviationFromRange(labs.hemoglobin, 12.0, 17.5) + deviationFromRange(labs.wbcCount, 4.0, 11.0) + deviationFromRange(labs.plateletCount, 150, 450)) / 3,
        0,
        1,
      ),
    },
    {
      label: "Lipid",
      value: clamp(
        (deviationFromRange(labs.ldl, 0, 100) + deviationFromRange(labs.hdl, 40, Infinity) + deviationFromRange(labs.triglycerides, 0, 150)) / 3,
        0,
        1,
      ),
    },
    {
      label: "Liver",
      value: clamp(
        (deviationFromRange(labs.ast, 10, 40) + deviationFromRange(labs.alt, 7, 56) + deviationFromRange(labs.bilirubin, 0.1, 1.2) + deviationFromRange(labs.albumin, 3.5, 5.0)) / 4,
        0,
        1,
      ),
    },
    {
      label: "Kidney",
      value: clamp(
        (deviationFromRange(labs.creatinine, 0.6, 1.3) + deviationFromRange(labs.urea, 7, 20) + deviationFromRange(labs.egfr, 90, Infinity)) / 3,
        0,
        1,
      ),
    },
    {
      label: "Vitals",
      value: clamp(
        (deviationFromRange(measurements.spo2, 95, 100) + deviationFromRange(measurements.temperature, 36.1, 37.2) + deviationFromRange(measurements.heartRate, 60, 100) + deviationFromRange(measurements.systolicBp, 90, 140)) / 4,
        0,
        1,
      ),
    },
  ];

  const heatmapCells = featureAttributions.slice(0, 9).map((entry, index) => ({
    label: entry.feature,
    value: entry.contribution,
    tone: index < 3 ? "critical" : index < 6 ? "elevated" : "moderate",
  }));

  const previousEntry = priorHistory[priorHistory.length - 1] || null;
  const previousScore = previousEntry?.score ?? null;
  const previousRisk = previousEntry?.riskLevel ?? "Baseline";
  const scoreDelta = previousScore === null ? overallScore : overallScore - previousScore;
  const direction = previousScore === null ? "baseline" : scoreDelta < 0 ? "improving" : scoreDelta > 0 ? "worsening" : "stable";
  const trendHistory = [
    ...priorHistory,
    {
      label: `Run ${priorHistory.length + 1}`,
      score: overallScore,
      riskLevel,
      timestamp: new Date().toISOString(),
    },
  ];

  const progression = [
    {
      label: "Before",
      score: previousScore === null ? clamp01(overallScore + 0.08) : previousScore,
      riskLevel: previousRisk,
      tone: "before",
    },
    {
      label: "After",
      score: overallScore,
      riskLevel,
      tone: "after",
    },
  ];

  return {
    overallScore,
    riskLevel,
    primaryModel: primaryModel.name,
    modelRows,
    performanceSeries,
    featureAttributions,
    shapSummary,
    trendSeries,
    radarMetrics,
    heatmapCells,
    history: trendHistory,
    beforeAfter: {
      beforeScore: progression[0].score,
      afterScore: progression[1].score,
      delta: scoreDelta,
      direction,
      beforeRisk: previousRisk,
      afterRisk: riskLevel,
    },
    progression,
    summaryPoints,
  };
}

function getRiskAction(riskLevel) {
  if (riskLevel === "High") {
    return {
      title: "Immediate escalation",
      description: "Arrange urgent clinical review or referral the same day.",
    };
  }
  if (riskLevel === "Medium") {
    return {
      title: "Prompt follow-up",
      description: "Schedule short-interval review and reinforce self-management advice.",
    };
  }
  return {
    title: "Routine monitoring",
    description: "Continue usual care with planned reassessment and routine observation.",
  };
}

function getImmediateRecommendations(riskLevel) {
  if (riskLevel === "High") {
    return [
      "Check airway, breathing, circulation, and acute red flags before discharge.",
      "Confirm medication adherence and the timing of the last dose taken.",
      "Escalate to a higher-level facility or clinician if symptoms worsen.",
      "Repeat key vitals and urgent labs if the clinical picture is changing.",
    ];
  }
  if (riskLevel === "Medium") {
    return [
      "Review the abnormal values with the patient or caregiver before they leave.",
      "Give clear instructions on hydration, diet, medication adherence, and warning signs.",
      "Arrange a short-interval reassessment or callback.",
      "Document any barriers to care, transport, or medicine access.",
    ];
  }
  return [
    "Share a concise explanation of the score and the main reassuring findings.",
    "Keep the patient on the routine monitoring pathway.",
    "Encourage continuation of current therapy and healthy follow-up habits.",
    "Provide a clear contact route if symptoms change.",
  ];
}

function getFollowUpPlan(riskLevel) {
  if (riskLevel === "High") {
    return [
      "Same-day referral or direct clinician review.",
      "Document the receiving destination and handoff contact.",
      "Arrange follow-up within 24-48 hours if referral is delayed.",
    ];
  }
  if (riskLevel === "Medium") {
    return [
      "Short-interval follow-up in 3-7 days.",
      "Repeat the most relevant abnormal labs and vitals.",
      "Review medication adherence and symptom trend.",
    ];
  }
  return [
    "Routine revisit at the next scheduled screening visit.",
    "Recheck vitals and key labs at standard intervals.",
    "Escalate only if new symptoms or worsening values appear.",
  ];
}

function getReferences() {
  return [
    "ADA Standards of Care in Diabetes",
    "WHO clinical screening and referral guidance",
    "Local lab reference intervals and escalation protocol",
    "Primary care follow-up and documentation policy",
  ];
}

async function fetchAnalysisDataset() {
  const response = await axios.get("/dashboard-data.json");
  return response.data;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickSeries(data) {
  const candidates = [
    data?.analysis?.trendSeries,
    data?.trendSeries,
    data?.riskProgression,
    data?.scoreTrend,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }
  return [];
}

function pickShapValues(data) {
  const candidates = [data?.analysis?.shapValues, data?.shapValues, data?.featureAttributions];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }
  return [];
}

function normalizeTrendSeries(source) {
  return safeArray(source)
    .map((item, index) => {
      const rawScore = Number(item.score ?? item.value ?? item.anomalyScore ?? item.risk ?? 0);
      const score = rawScore > 1 ? clamp01(rawScore / 100) : clamp01(rawScore);
      return {
        label: item.label ?? item.name ?? `T${index + 1}`,
        score,
        riskLevel: item.riskLevel ?? item.band ?? item.risk ?? "",
      };
    })
    .filter((item) => Number.isFinite(item.score));
}

function normalizeRadarMetrics(source) {
  return safeArray(source)
    .map((item, index) => ({
      label: item.label ?? item.name ?? `Metric ${index + 1}`,
      value: clamp01(Number(item.value ?? item.score ?? 0)),
    }))
    .filter((item) => item.label);
}

function normalizeShapValues(source) {
  return safeArray(source)
    .map((item, index) => ({
      feature: item.feature ?? item.label ?? item.name ?? `Feature ${index + 1}`,
      contribution: clamp01(Number(item.contribution ?? item.value ?? item.score ?? 0)),
      direction: item.direction ?? item.sign ?? (index % 2 === 0 ? "positive" : "negative"),
      value: item.value ?? item.rawValue ?? "",
    }))
    .filter((item) => item.feature);
}

function PatientDetailsPage() {
  const { patient, updateSection, markStepComplete, markStepIncomplete } = usePatient();
  const step = flowSteps[0];
  const weight = Number(patient.measurements.weight);
  const heightMeters = Number(patient.measurements.height) / 100;
  const bmi = weight > 0 && heightMeters > 0 ? (weight / (heightMeters * heightMeters)).toFixed(1) : "—";
  const requiredIntakeFields = React.useMemo(
    () => [
      { label: "Patient ID", value: patient.demographics.patientId },
      { label: "Full name", value: patient.demographics.fullName },
      { label: "Age", value: patient.demographics.age },
      { label: "Chief complaint", value: patient.visit.chiefComplaint },
      { label: "Visit date", value: patient.visit.visitDate },
    ],
    [
      patient.demographics.age,
      patient.demographics.fullName,
      patient.demographics.patientId,
      patient.visit.chiefComplaint,
      patient.visit.visitDate,
    ],
  );
  const missingRequiredFields = requiredIntakeFields.filter((field) => !String(field.value || "").trim());
  const intakeReady = missingRequiredFields.length === 0;

  React.useEffect(() => {
    if (intakeReady) {
      markStepComplete(step.slug);
      return;
    }
    markStepIncomplete(step.slug);
  }, [intakeReady, markStepComplete, markStepIncomplete, step.slug]);

  const handleNext = React.useCallback(
    async ({ navigate, nextStep, stepSlug, markStepComplete: completeStep }) => {
      if (!intakeReady || !nextStep) {
        return;
      }

      completeStep(stepSlug);
      navigate(`/${nextStep.slug}`);
    },
    [intakeReady],
  );

  return (
    <StepSkeleton
      step={step}
      nextDisabled={!intakeReady}
      nextLabel={intakeReady ? "Save intake and continue" : "Complete required fields"}
      onNext={handleNext}
      left={
        <div className="section-stack">
          <SectionCard
            eyebrow="Profile"
            title="Patient profile"
            description="Basic identity and encounter details that anchor the rest of the flow."
          >
            <TwoColumnFields>
              <label>
                <span>Patient ID</span>
                <input
                  value={patient.demographics.patientId}
                  onChange={(e) => updateSection("demographics", { patientId: e.target.value })}
                  placeholder="RH-2048"
                />
              </label>
              <label>
                <span>Full name</span>
                <input
                  value={patient.demographics.fullName}
                  onChange={(e) => updateSection("demographics", { fullName: e.target.value })}
                  placeholder="Amina Rahman"
                />
              </label>
              <label>
                <span>Age</span>
                <input
                  type="number"
                  value={patient.demographics.age}
                  onChange={(e) => updateSection("demographics", { age: e.target.value })}
                  placeholder="54"
                />
              </label>
              <label>
                <span>Sex</span>
                <select value={patient.demographics.sex} onChange={(e) => updateSection("demographics", { sex: e.target.value })}>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                <span>Location type</span>
                <select
                  value={patient.demographics.locationType}
                  onChange={(e) => updateSection("demographics", { locationType: e.target.value })}
                >
                  <option>Clinic</option>
                  <option>Home visit</option>
                  <option>Community outreach</option>
                  <option>Referral center</option>
                </select>
              </label>
            </TwoColumnFields>
          </SectionCard>

          <SectionCard
            eyebrow="Clinical visit"
            title="Visit summary"
            description="Capture the current complaint and the context of the encounter."
          >
            <div className="form-grid">
              <label>
                <span>Chief complaint</span>
                <textarea
                  rows="4"
                  value={patient.visit.chiefComplaint}
                  onChange={(e) => updateSection("visit", { chiefComplaint: e.target.value })}
                  placeholder="Fever, fatigue, and reduced appetite over the last 5 days."
                />
              </label>
              <TwoColumnFields>
                <label>
                  <span>Symptom onset</span>
                  <input
                    value={patient.visit.symptomOnset}
                    onChange={(e) => updateSection("visit", { symptomOnset: e.target.value })}
                    placeholder="5 days"
                  />
                </label>
                <label>
                  <span>Visit date</span>
                  <input
                    type="date"
                    value={patient.visit.visitDate}
                    onChange={(e) => updateSection("visit", { visitDate: e.target.value })}
                  />
                </label>
                <label>
                  <span>Triage priority</span>
                  <select value={patient.visit.triagePriority} onChange={(e) => updateSection("visit", { triagePriority: e.target.value })}>
                    <option>Routine</option>
                    <option>Urgent</option>
                    <option>Emergency</option>
                  </select>
                </label>
              </TwoColumnFields>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Medical history"
            title="Medications and chronic conditions"
            description="Long-term conditions and current therapy stay visible for later decision support."
          >
            <div className="form-grid">
              <label>
                <span>Comorbidities</span>
                <input
                  value={patient.medicalHistory.comorbidities}
                  onChange={(e) => updateSection("medicalHistory", { comorbidities: e.target.value })}
                />
              </label>
              <TwoColumnFields>
                <label>
                  <span>Current medications</span>
                  <input
                    value={patient.medicalHistory.currentMedications}
                    onChange={(e) => updateSection("medicalHistory", { currentMedications: e.target.value })}
                  />
                </label>
                <label>
                  <span>Allergies</span>
                  <input
                    value={patient.medicalHistory.allergies}
                    onChange={(e) => updateSection("medicalHistory", { allergies: e.target.value })}
                    placeholder="No known allergies"
                  />
                </label>
                <label>
                  <span>Family history</span>
                  <input
                    value={patient.medicalHistory.familyHistory}
                    onChange={(e) => updateSection("medicalHistory", { familyHistory: e.target.value })}
                    placeholder="Diabetes, hypertension"
                  />
                </label>
                <label>
                  <span>Social history</span>
                  <input
                    value={patient.medicalHistory.socialHistory}
                    onChange={(e) => updateSection("medicalHistory", { socialHistory: e.target.value })}
                    placeholder="Smoking, alcohol, activity"
                  />
                </label>
              </TwoColumnFields>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Clinical measurements"
            title="Vitals and anthropometrics"
            description="Measure the patient now. BMI is calculated from weight and height."
          >
            <div className="measurement-summary">
              <NumberSummary label="BMI" value={bmi} suffix="" />
              <NumberSummary label="Weight" value={patient.measurements.weight || "—"} suffix=" kg" />
              <NumberSummary label="Height" value={patient.measurements.height || "—"} suffix=" cm" />
            </div>
            <TwoColumnFields>
              <label>
                <span>Heart rate</span>
                <input
                  type="number"
                  value={patient.measurements.heartRate}
                  onChange={(e) => updateSection("measurements", { heartRate: e.target.value })}
                  placeholder="84"
                />
              </label>
              <label>
                <span>Systolic BP</span>
                <input
                  type="number"
                  value={patient.measurements.systolicBp}
                  onChange={(e) => updateSection("measurements", { systolicBp: e.target.value })}
                  placeholder="136"
                />
              </label>
              <label>
                <span>Diastolic BP</span>
                <input
                  type="number"
                  value={patient.measurements.diastolicBp}
                  onChange={(e) => updateSection("measurements", { diastolicBp: e.target.value })}
                  placeholder="88"
                />
              </label>
              <label>
                <span>SpO2</span>
                <input
                  type="number"
                  value={patient.measurements.spo2}
                  onChange={(e) => updateSection("measurements", { spo2: e.target.value })}
                  placeholder="94"
                />
              </label>
              <label>
                <span>Temperature</span>
                <input
                  type="number"
                  step="0.1"
                  value={patient.measurements.temperature}
                  onChange={(e) => updateSection("measurements", { temperature: e.target.value })}
                  placeholder="37.4"
                />
              </label>
              <label>
                <span>Respiratory rate</span>
                <input
                  type="number"
                  value={patient.measurements.respiratoryRate}
                  onChange={(e) => updateSection("measurements", { respiratoryRate: e.target.value })}
                  placeholder="16"
                />
              </label>
              <label>
                <span>Weight (kg)</span>
                <input
                  type="number"
                  step="0.1"
                  value={patient.measurements.weight}
                  onChange={(e) => updateSection("measurements", { weight: e.target.value })}
                  placeholder="64.2"
                />
              </label>
              <label>
                <span>Height (cm)</span>
                <input
                  type="number"
                  step="0.1"
                  value={patient.measurements.height}
                  onChange={(e) => updateSection("measurements", { height: e.target.value })}
                  placeholder="168"
                />
              </label>
            </TwoColumnFields>
          </SectionCard>
        </div>
      }
      right={
        <div className="stack">
          <section className={`intake-summary-card${intakeReady ? " is-ready" : ""}`}>
            <div className="viz-card__head">
              <div>
                <strong>Intake readiness</strong>
                <p>Once the required fields are captured, the workflow unlocks the next step automatically.</p>
              </div>
              <span className={`status-pill${intakeReady ? "" : " status-pill--locked"}`}>
                {intakeReady ? "Ready to continue" : `${missingRequiredFields.length} missing`}
              </span>
            </div>
            <div className="intake-summary-grid">
              <div className="summary-pill">
                <span>Completion</span>
                <strong>{Math.round(((requiredIntakeFields.length - missingRequiredFields.length) / requiredIntakeFields.length) * 100)}%</strong>
              </div>
              <div className="summary-pill">
                <span>BMI</span>
                <strong>{bmi}</strong>
              </div>
              <div className="summary-pill">
                <span>Triage</span>
                <strong>{patient.visit.triagePriority}</strong>
              </div>
              <div className="summary-pill">
                <span>Location</span>
                <strong>{patient.demographics.locationType}</strong>
              </div>
            </div>
            <div className="intake-checklist">
              {requiredIntakeFields.map((field) => (
                <div key={field.label} className="intake-checklist__item">
                  <span>{field.label}</span>
                  <strong>{String(field.value || "").trim() ? "Captured" : "Missing"}</strong>
                </div>
              ))}
            </div>
          </section>
          <div className="callout">
            <strong>Page 1 structure</strong>
            <p>
              Profile, clinical visit, medical history, and measurements stay in one place so we can carry the same
              patient record into the later pages.
            </p>
          </div>
          <ul className="bullet-list">
            <li>Profile: identity and encounter anchor</li>
            <li>Clinical visit: complaint and timing</li>
            <li>Med history: chronic conditions and therapy</li>
            <li>Measurements: vitals plus BMI</li>
          </ul>
        </div>
      }
      footer="This page is now a proper intake form and should be the first stop for every patient record."
    />
  );
}

function LabInvestigationPage() {
  const { patient, updateSection, markStepComplete } = usePatient();
  const step = flowSteps[1];
  const [uploadState, setUploadState] = React.useState({
    status: "idle",
    message: "Upload PDF or CSV lab report to auto-fill the form.",
  });
  const form = useForm({
    resolver: zodResolver(labSchema),
    mode: "onChange",
    defaultValues: patient.labs,
  });
  const {
    register,
    control,
    setValue,
    trigger,
    formState: { errors, isValid, isSubmitting },
  } = form;
  const watchedLabs = useWatch({ control });
  const panelFields = React.useMemo(
    () =>
      labPanels.map((panel) => ({
        ...panel,
        fields: labFieldSpecs.filter((field) => field.panel === panel.key),
      })),
    [],
  );

  React.useEffect(() => {
    if (watchedLabs) {
      updateSection("labs", watchedLabs);
    }
  }, [updateSection, watchedLabs]);

  React.useEffect(() => {
    trigger();
  }, [trigger]);

  const applyParsedValues = React.useCallback(
    (parsedValues, sourceLabel) => {
      const mapped = mapParsedLabValues(parsedValues);
      const entries = Object.entries(mapped);
      if (!entries.length) {
        setUploadState({
          status: "warning",
          message: `No recognizable lab fields were found in the ${sourceLabel}.`,
        });
        return;
      }

      entries.forEach(([key, value]) => {
        setValue(key, value, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      });

      setUploadState({
        status: "success",
        message: `Auto-filled ${entries.length} field${entries.length === 1 ? "" : "s"} from the ${sourceLabel}.`,
      });
    },
    [setValue],
  );

  const handleUpload = React.useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const sourceLabel = file.name.toLowerCase().endsWith(".pdf") ? "PDF report" : "CSV report";
      setUploadState({
        status: "parsing",
        message: `Parsing ${sourceLabel}...`,
      });

      try {
        const parsedValues = file.name.toLowerCase().endsWith(".pdf")
          ? await parsePdfFile(file)
          : await parseCsvFile(file);
        applyParsedValues(parsedValues, sourceLabel);
      } catch (error) {
        setUploadState({
          status: "error",
          message: `Could not parse the selected file: ${error.message}`,
        });
      } finally {
        event.target.value = "";
      }
    },
    [applyParsedValues],
  );

  const handleNext = React.useCallback(
    async ({ navigate, nextStep, stepSlug }) => {
      const valid = await trigger();
      if (!valid || !nextStep) {
        if (!valid) {
          setUploadState({
            status: "error",
            message: "Please complete all required lab fields before continuing.",
          });
        }
        return;
      }

      markStepComplete(stepSlug);
      navigate(`/${nextStep.slug}`);
    },
    [markStepComplete, trigger],
  );

  const missingFields = labFieldSpecs.filter((field) => !watchedLabs?.[field.key]).length;

  return (
    <StepSkeleton
      step={step}
      nextDisabled={!isValid || isSubmitting || uploadState.status === "parsing"}
      nextLabel="Continue to Patient Care Insights"
      onNext={handleNext}
      left={
        <div className="section-stack">
          <SectionCard
            eyebrow="Report upload"
            title="Upload PDF or CSV report"
            description="Parse a lab report and auto-fill the matching fields before you review the numbers."
          >
            <div className="upload-zone">
              <label className="upload-button">
                <input type="file" accept=".pdf,.csv" onChange={handleUpload} />
                <span>Choose PDF or CSV</span>
              </label>
              <div className={`upload-status upload-status--${uploadState.status}`}>
                {uploadState.message}
              </div>
            </div>
          </SectionCard>

          {panelFields.map((panel) => (
            <SectionCard
              key={panel.key}
              eyebrow={panel.label}
              title={`${panel.label} panel`}
              description={panel.description}
            >
              <div className="panel-grid">
                {panel.fields.map((field) => (
                  <LabField
                    key={field.key}
                    field={field}
                    register={register}
                    error={errors[field.key]}
                    value={watchedLabs?.[field.key] || ""}
                    onAutoFill={(key, value) => {
                      setValue(key, value, {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      });
                    }}
                  />
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      }
      right={
        <div className="stack">
          <div className="callout callout--soft">
            <strong>Validation and hints</strong>
            <p>Required fields are guarded before Next. Range hints turn green when values sit in the expected clinical band and amber when they fall outside it.</p>
          </div>
          <div className="measurement-summary">
            <NumberSummary label="Required left" value={missingFields} suffix=" fields" />
            <NumberSummary label="Form status" value={isValid ? "Ready" : "Incomplete"} suffix="" />
            <NumberSummary label="Upload" value={uploadState.status} suffix="" />
          </div>
          <div className="callout">
            <strong>What happens next</strong>
            <p>Once the form passes validation, Page 3 can consume the normalized lab state without any extra re-entry.</p>
          </div>
        </div>
      }
      footer="This page now combines manual entry, upload parsing, and validation in one workflow."
    />
  );
}

function PatientCareInsightsPage() {
  const { patient, updateSection } = usePatient();
  const step = flowSteps[2];

  return (
    <StepSkeleton
      step={step}
      left={
        <div className="stack">
          <label>
            <span>Clinician summary</span>
            <textarea
              rows="6"
              value={patient.careInsights.clinicianSummary}
              onChange={(e) => updateSection("careInsights", { clinicianSummary: e.target.value })}
            />
          </label>
        </div>
      }
      right={
        <div className="stack">
          <div className="callout">
            <strong>Insight surface</strong>
            <p>This page will later convert the intake and lab record into a care narrative for clinicians.</p>
          </div>
          <ul className="bullet-list">
            <li>Observed risk signals</li>
            <li>Suggested follow-up urgency</li>
            <li>Care coordination needs</li>
            <li>Escalation checklist</li>
          </ul>
        </div>
      }
      footer="The context collected here should stay human-readable so clinicians can review it without leaving the page."
    />
  );
}

function ComparativeAnalysisPage() {
  const { patient, modelResults, setModelResults, markStepComplete, markStepIncomplete } = usePatient();
  const step = flowSteps[3];
  const [isRunning, setIsRunning] = React.useState(false);
  const runTimerRef = React.useRef(null);
  const analysisReady = modelResults.status === "complete";
  const analysisDatasetQuery = useQuery({
    queryKey: ["analysis-dataset"],
    queryFn: fetchAnalysisDataset,
  });

  React.useEffect(() => () => {
    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }
  }, []);

  const handleRunAnalysis = React.useCallback(() => {
    if (isRunning) {
      return;
    }

    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }

    setIsRunning(true);
    setModelResults((current) => ({
      ...current,
      status: "running",
      riskLevel: "Running",
      summaryPoints: ["Running comparative analysis..."],
    }));

    runTimerRef.current = setTimeout(() => {
      const results = computeAnalysisResults(patient, modelResults.history || []);
      setModelResults((current) => ({
        ...current,
        status: "complete",
        runCount: current.runCount + 1,
        lastRunAt: new Date().toISOString(),
        ...results,
      }));
      markStepComplete(step.slug);
      setIsRunning(false);
      runTimerRef.current = null;
    }, 1200);
  }, [isRunning, markStepComplete, modelResults.history, patient, setModelResults, step.slug]);

  const handleResetAnalysis = React.useCallback(() => {
    if (runTimerRef.current) {
      clearTimeout(runTimerRef.current);
    }
    setIsRunning(false);
    setModelResults({ ...initialAnalysisState });
    markStepIncomplete(step.slug);
    runTimerRef.current = null;
  }, [markStepIncomplete, setModelResults, step.slug]);

  const comparisonRows = React.useMemo(
    () => normalizeComparisonModels(analysisReady ? modelResults.modelRows : analysisModelCatalog),
    [analysisReady, modelResults.modelRows],
  );
  const bestModel = React.useMemo(() => getBestComparisonModel(comparisonRows), [comparisonRows]);
  const comparisonInsights = React.useMemo(() => {
    const sortedByScore = [...comparisonRows].sort((a, b) => b.score - a.score);
    const fastest = [...comparisonRows].sort(
      (a, b) => (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY),
    )[0] || null;
    const lightest = [...comparisonRows].sort(
      (a, b) => (a.memoryMb ?? Number.POSITIVE_INFINITY) - (b.memoryMb ?? Number.POSITIVE_INFINITY),
    )[0] || null;
    const bestTradeoff =
      [...comparisonRows].sort((a, b) => {
        const aCost = clamp01((a.latencyMs ?? 0) / 12) * 0.08 + clamp01((a.memoryMb ?? 0) / 140) * 0.06;
        const bCost = clamp01((b.latencyMs ?? 0) / 12) * 0.08 + clamp01((b.memoryMb ?? 0) / 140) * 0.06;
        return b.score - bCost - (a.score - aCost);
      })[0] || null;
    const scoreSpread = sortedByScore.length > 1 ? sortedByScore[0].score - sortedByScore[sortedByScore.length - 1].score : 0;
    return {
      leader: sortedByScore[0] || null,
      fastest,
      lightest,
      bestTradeoff,
      scoreSpread,
    };
  }, [comparisonRows]);

  const summaryPoints = analysisReady ? modelResults.summaryPoints || [] : [];
  const loadingLabel = analysisDatasetQuery.isLoading
    ? "Loading dashboard data..."
    : analysisDatasetQuery.isError
      ? "Using computed analysis data"
      : "Dashboard data ready";

  return (
    <StepSkeleton
      step={step}
      nextDisabled={!analysisReady}
      nextLabel="Continue to Decision Support"
      left={
        <div className="section-stack">
          <section className="analysis-control card">
            <div className="analysis-control__head">
              <div>
                <p className="eyebrow">Run / Reset</p>
                <h3>Comparative analysis</h3>
                <p className="section-card__description">
                  Compare detector behavior, review the best tradeoff, and inspect how the leading models diverge.
                </p>
              </div>
              <div className={`analysis-status-chip analysis-status-chip--${modelResults.status}`}>
                {modelResults.status === "running" ? "Running" : analysisReady ? "Complete" : "Idle"}
              </div>
            </div>
            <div className="analysis-fetch-chip">
              <span>React Query + Axios</span>
              <strong>{loadingLabel}</strong>
            </div>
            <div className="analysis-control__buttons">
              <button type="button" className="button button--primary" onClick={handleRunAnalysis} disabled={isRunning}>
                {isRunning ? "Running comparative analysis..." : "Run anomaly test"}
              </button>
              <button type="button" className="button button--ghost" onClick={handleResetAnalysis}>
                Reset analysis
              </button>
            </div>
            <div className="analysis-mini-grid">
              <div className="analysis-mini-card">
                <span>Run count</span>
                <strong>{analysisReady ? modelResults.runCount : 0}</strong>
              </div>
              <div className="analysis-mini-card">
                <span>Leader</span>
                <strong>{comparisonInsights.leader?.name || "Locked"}</strong>
              </div>
              <div className="analysis-mini-card">
                <span>Highest score</span>
                <strong>{analysisReady ? `${Math.round((comparisonInsights.leader?.score ?? 0) * 100)}%` : "0%"}</strong>
              </div>
              <div className="analysis-mini-card">
                <span>Best tradeoff</span>
                <strong>{comparisonInsights.bestTradeoff?.name || "Locked"}</strong>
              </div>
            </div>
          </section>

          <AnalysisSection
            unlocked={true}
            eyebrow="Score histogram"
            title="Anomaly score distribution"
            description="The first visit shows a single bar. After you run the analysis, the chart grows with each saved run."
          >
            {analysisReady ? (
              <ScoreHistogramCard
                history={modelResults.history || []}
                currentScore={modelResults.overallScore ?? 0}
                loading={analysisDatasetQuery.isLoading}
              />
            ) : (
              <HistogramSeedCard currentScore={modelResults.overallScore ?? 0} />
            )}
          </AnalysisSection>

          <AnalysisSection
            unlocked={true}
            eyebrow="Timeline"
            title="Anomaly score timeline"
            description="The timeline starts with a single seeded point and expands as new runs are recorded."
          >
            <AnomalyTimelineCard
              series={modelResults.trendSeries || []}
              currentScore={modelResults.overallScore ?? 0}
              loading={analysisDatasetQuery.isLoading}
            />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Comparison matrix"
            title="Model performance side by side"
            description="This view compares score, precision, recall, and accuracy so the strongest detector is visible at a glance."
            lockMessage="Run the anomaly test to unlock the comparison matrix."
          >
            <div className="section-stack">
              <ModelComparisonChart models={comparisonRows} />
              <ModelComparisonTable models={comparisonRows} />
            </div>
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Operational cost"
            title="Latency and memory tradeoffs"
            description="Comparative analysis should show not only model quality, but also runtime cost."
            lockMessage="Run the anomaly test to unlock the operational comparison."
          >
            <div className="comparison-grid">
              <GraphPanel
                title="Latency comparison"
                subtitle="Lower latency is better for rural deployment and quick triage."
                items={comparisonRows}
                valueKey="latencyMs"
                valueLabel="ms"
                reverse
              />
              <GraphPanel
                title="Memory comparison"
                subtitle="Lower memory footprint is easier on constrained devices."
                items={comparisonRows}
                valueKey="memoryMb"
                valueLabel="MB"
                reverse
              />
            </div>
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Before / after"
            title="Change from the previous run"
            description="This comparison shows whether the latest patient context is improving or worsening the anomaly score."
            lockMessage="Run the anomaly test to unlock the before and after view."
          >
            <ProgressComparisonCard beforeAfter={modelResults.beforeAfter} progression={modelResults.progression} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Narrative"
            title="What the comparison means"
            description="A short readout turns the raw metrics into an interpretation for clinicians."
            lockMessage="Run the anomaly test to unlock the summary narrative."
          >
            <div className="callout callout--soft">
              <strong>Comparative takeaway</strong>
              <p>
                {analysisReady
                  ? `The ${comparisonInsights.bestTradeoff?.name || "selected model"} offers the best balance of predictive quality and operational cost, while ${comparisonInsights.fastest?.name || "the fastest detector"} is the quickest to serve.`
                  : "Run the anomaly test to see the tradeoff summary."}
              </p>
            </div>
            <ul className="bullet-list">
              {summaryPoints.length
                ? summaryPoints.map((point) => <li key={point}>{point}</li>)
                : [
                    "Leader, tradeoff, and spread metrics stay locked until the analysis is complete.",
                    "Operational cost is included alongside model quality so deployment constraints stay visible.",
                  ].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </AnalysisSection>
        </div>
      }
      right={
        <div className="section-stack">
          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Risk map"
            title="Comparative model risk map"
            description="Model scores are placed into Low, Medium, and High bands to show the spread at a glance."
            lockMessage="Run the anomaly test to unlock the risk map."
          >
            <ComparisonRiskMap models={comparisonRows} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Radar"
            title="Clinical deviation radar"
            description="The underlying patient signals explain why the comparative score moved."
            lockMessage="Run the anomaly test to unlock the radar view."
          >
            <RechartsRadarCard metrics={modelResults.radarMetrics} loading={analysisDatasetQuery.isLoading} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Feature drivers"
            title="Top comparative drivers"
            description="The strongest features help explain the current run."
            lockMessage="Run the anomaly test to unlock the feature contributions."
          >
            <RechartsShapCard features={modelResults.shapSummary} loading={analysisDatasetQuery.isLoading} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Consensus"
            title="Detector consensus strip"
            description="The most confident detectors are grouped together for a quick read."
            lockMessage="Run the anomaly test to unlock the consensus strip."
          >
            <AnomalySummaryStrip modelRows={comparisonRows} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Interpretation"
            title="How to read this page"
            description="A concise interpretation helps bridge the gap between model metrics and decision support."
            lockMessage="Run the anomaly test to unlock the interpretation."
          >
            <div className="callout callout--soft">
              <strong>Current read</strong>
              <p>
                {analysisReady
                  ? `The ${bestModel?.name || "selected"} detector is leading with a ${Math.round((bestModel?.score ?? 0) * 100)}% comparative score, and the score spread is ${Math.round((comparisonInsights.scoreSpread || 0) * 100)}%.`
                  : "Run the anomaly test to see which detector is currently strongest."}
              </p>
            </div>
          </AnalysisSection>
        </div>
      }
      footer="This comparative page now emphasizes model ranking, operational tradeoffs, and a clear narrative for decision support."
    />
  );
}

function DecisionSupportPage() {
  const { patient, modelResults, updateSection } = usePatient();
  const step = flowSteps[4];
  const analysisReady = modelResults.status === "complete";
  const comparisonRows = React.useMemo(
    () => normalizeComparisonModels(analysisReady ? modelResults.modelRows : analysisModelCatalog),
    [analysisReady, modelResults.modelRows],
  );
  const bestModel = React.useMemo(() => getBestComparisonModel(comparisonRows), [comparisonRows]);
  const consensusModels = React.useMemo(() => [...comparisonRows].sort((a, b) => b.score - a.score).slice(0, 4), [comparisonRows]);
  const topSignals = React.useMemo(
    () => (modelResults.shapSummary?.length ? modelResults.shapSummary : modelResults.featureAttributions || []).slice(0, 6),
    [modelResults.featureAttributions, modelResults.shapSummary],
  );
  const consensusScore = React.useMemo(() => {
    if (!consensusModels.length) {
      return 0;
    }
    return consensusModels.reduce((sum, model) => sum + model.score, 0) / consensusModels.length;
  }, [consensusModels]);
  const consensusSpread = React.useMemo(() => {
    if (consensusModels.length < 2) {
      return 0;
    }
    return consensusModels[0].score - consensusModels[consensusModels.length - 1].score;
  }, [consensusModels]);
  const riskAction = getRiskAction(analysisReady ? modelResults.riskLevel : "Low");
  const immediateRecommendations = getImmediateRecommendations(analysisReady ? modelResults.riskLevel : "Low");
  const followUpPlan = getFollowUpPlan(analysisReady ? modelResults.riskLevel : "Low");
  const references = getReferences();
  const screeningLabel = analysisReady ? `${modelResults.riskLevel} risk` : "Awaiting analysis";
  const screeningTone = analysisReady ? modelResults.riskLevel.toLowerCase() : "locked";
  const scoreLabel = analysisReady ? modelResults.overallScore.toFixed(2) : "0.00";
  const [feedbackForm, setFeedbackForm] = React.useState({
    stance: "Agree",
    confidence: "4",
    action: "Monitor",
    note: "",
  });
  const [feedbackState, setFeedbackState] = React.useState({
    status: "idle",
    message: "Feedback will be sent to the clinician feedback API.",
  });

  const handleFeedbackChange = React.useCallback((field, value) => {
    setFeedbackForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleFeedbackSubmit = React.useCallback(
    async (event) => {
      event.preventDefault();
      if (!analysisReady) {
        return;
      }

      setFeedbackState({
        status: "submitting",
        message: "Submitting clinician feedback...",
      });

      try {
        const result = await submitClinicianFeedback({
          patientId: patient.demographics.patientId || "anonymous",
          patientName: patient.demographics.fullName || "Unknown patient",
          riskLevel: modelResults.riskLevel,
          overallScore: modelResults.overallScore,
          primaryModel: bestModel?.name || modelResults.primaryModel,
          consensusScore,
          consensusSpread,
          ...feedbackForm,
          submittedAt: new Date().toISOString(),
        });

        setFeedbackState({
          status: "saved",
          message:
            result.source === "api"
              ? "Feedback sent to the clinician feedback API."
              : "Feedback saved locally because the API was unavailable.",
        });
        setFeedbackForm((current) => ({
          ...current,
          note: "",
        }));
      } catch (error) {
        setFeedbackState({
          status: "error",
          message: "Feedback could not be saved. Please try again.",
        });
      }
    },
    [
      analysisReady,
      bestModel?.name,
      consensusScore,
      consensusSpread,
      feedbackForm,
      modelResults.overallScore,
      modelResults.primaryModel,
      modelResults.riskLevel,
      patient.demographics.fullName,
      patient.demographics.patientId,
    ],
  );

  return (
    <StepSkeleton
      step={step}
      nextDisabled={!analysisReady}
      nextLabel="Continue to Backend Processing"
      left={
        <div className="section-stack">
          <section className={`result-card result-card--${screeningTone}`}>
            <div className="result-card__head">
              <div>
                <p className="eyebrow">Screening result</p>
                <h3>Patient risk summary</h3>
                <p className="section-card__description">
                  {analysisReady
                    ? "The risk card below summarizes the current test result and highlights the recommended action."
                    : "Run the anomaly test on the analysis page to unlock the final screening result."}
                </p>
              </div>
              <div className="result-pill">{screeningLabel}</div>
            </div>
            <div className="result-card__metrics">
              <div className="result-stat">
                <span>Overall score</span>
                <strong>{scoreLabel}</strong>
              </div>
              <div className="result-stat">
                <span>Primary model</span>
                <strong>{analysisReady ? modelResults.primaryModel : "Locked"}</strong>
              </div>
              <div className="result-stat">
                <span>Current status</span>
                <strong>{analysisReady ? modelResults.status : "Idle"}</strong>
              </div>
            </div>
          </section>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Top signals"
            title="Top contributing signals"
            description="These are the strongest inputs shaping the current risk score."
            lockMessage="Run the anomaly test to unlock the signal summary."
          >
            <RechartsShapCard features={topSignals} loading={!analysisReady} />
            <ul className="bullet-list">
              {(topSignals.length ? topSignals : [{ feature: "Waiting for analysis" }]).slice(0, 3).map((signal) => (
                <li key={signal.feature || signal.name}>
                  {signal.feature || signal.name}
                  {signal.contribution ? ` - ${Math.round(signal.contribution * 100)}% contribution` : ""}
                </li>
              ))}
            </ul>
          </AnalysisSection>

          <section className="recommendation-card">
            <p className="eyebrow">Risk action</p>
            <h3>{riskAction.title}</h3>
            <p className="section-card__description">{riskAction.description}</p>
            <div className="callout callout--accent">
              <strong>Suggested disposition</strong>
              <p>
                {analysisReady
                  ? modelResults.riskLevel === "High"
                    ? "Escalate to urgent review and do not delay handoff."
                    : modelResults.riskLevel === "Medium"
                      ? "Keep the patient in a short-interval follow-up pathway."
                      : "Continue routine care with normal screening follow-up."
                  : "No disposition is active until the test is run."}
              </p>
            </div>
          </section>

          <section className="decision-feedback-card">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Clinician feedback</p>
                <h3>Feedback input</h3>
              </div>
              <span className={`analysis-status-chip analysis-status-chip--${feedbackState.status === "error" ? "idle" : feedbackState.status === "saved" ? "complete" : feedbackState.status === "submitting" ? "running" : "idle"}`}>
                {feedbackState.status === "submitting"
                  ? "Submitting"
                  : feedbackState.status === "saved"
                    ? "Saved"
                    : feedbackState.status === "error"
                      ? "Error"
                      : "Ready"}
              </span>
            </div>
            <p className="section-card__description">{feedbackState.message}</p>
            <form className="decision-feedback-form" onSubmit={handleFeedbackSubmit}>
              <label>
                <span>Agreement</span>
                <select value={feedbackForm.stance} onChange={(e) => handleFeedbackChange("stance", e.target.value)} disabled={!analysisReady}>
                  <option>Agree</option>
                  <option>Partially agree</option>
                  <option>Disagree</option>
                </select>
              </label>
              <label>
                <span>Confidence</span>
                <select value={feedbackForm.confidence} onChange={(e) => handleFeedbackChange("confidence", e.target.value)} disabled={!analysisReady}>
                  <option value="1">1 - Very low</option>
                  <option value="2">2 - Low</option>
                  <option value="3">3 - Moderate</option>
                  <option value="4">4 - High</option>
                  <option value="5">5 - Very high</option>
                </select>
              </label>
              <label>
                <span>Suggested action</span>
                <select value={feedbackForm.action} onChange={(e) => handleFeedbackChange("action", e.target.value)} disabled={!analysisReady}>
                  <option>Escalate</option>
                  <option>Review</option>
                  <option>Monitor</option>
                </select>
              </label>
              <label className="decision-feedback-form__full">
                <span>Clinician note</span>
                <textarea
                  rows="4"
                  value={feedbackForm.note}
                  onChange={(e) => handleFeedbackChange("note", e.target.value)}
                  placeholder="Capture bedside context, missing data, or why you agree or disagree."
                  disabled={!analysisReady}
                />
              </label>
              <button type="submit" className="button button--primary decision-feedback-form__submit" disabled={!analysisReady || feedbackState.status === "submitting"}>
                {feedbackState.status === "submitting" ? "Sending..." : "Submit feedback"}
              </button>
            </form>
          </section>
        </div>
      }
      right={
        <div className="section-stack">
          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Consensus"
            title="Model consensus display"
            description="See how closely the leading detectors agree on the current decision."
            lockMessage="Run the anomaly test to unlock the consensus display."
          >
            <DecisionConsensusCard models={comparisonRows} />
          </AnalysisSection>

          <AnalysisSection
            unlocked={analysisReady}
            eyebrow="Risk map"
            title="Consensus risk map"
            description="The risk map plots score against latency so you can see both accuracy and operational cost."
            lockMessage="Run the anomaly test to unlock the risk map."
          >
            <DecisionRiskMap models={comparisonRows} />
          </AnalysisSection>

          <section className={`recommendation-card recommendation-card--${screeningTone}`}>
            <p className="eyebrow">Immediate recommendations</p>
            <h3>What to do now</h3>
            <ul className="bullet-list">
              {immediateRecommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`recommendation-card recommendation-card--${screeningTone}`}>
            <p className="eyebrow">Follow-up plan</p>
            <h3>Next-touch plan</h3>
            <ul className="bullet-list">
              {followUpPlan.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="recommendation-card">
            <p className="eyebrow">References</p>
            <h3>Source guidance</h3>
            <ul className="bullet-list">
              {references.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      }
      footer="This page turns the analysis into decision support, consensus review, clinician feedback, and action before the backend processing stage."
    />
  );
}

function BackendProcessingPage() {
  const { patient, updateSection } = usePatient();
  const step = flowSteps[5];
  const pipeline = React.useMemo(() => buildFeatureEngineeringPipeline(patient), [patient]);

  const syncPipeline = React.useCallback(() => {
    updateSection("backendProcessing", {
      pipelineStatus: pipeline.pipelineStatus,
      featureCount: pipeline.engineeredCount + pipeline.encodedCount,
    });
  }, [pipeline.encodedCount, pipeline.engineeredCount, pipeline.pipelineStatus, updateSection]);

  const resetPipeline = React.useCallback(() => {
    updateSection("backendProcessing", {
      pipelineStatus: "Draft",
      featureCount: 0,
    });
  }, [updateSection]);

  return (
    <StepSkeleton
      step={step}
      left={
        <div className="section-stack">
          <section className="backend-control-card">
            <div className="analysis-control__head">
              <div>
                <p className="eyebrow">Feature eng. pipeline</p>
                <h3>Backend processing</h3>
                <p className="section-card__description">
                  Build, normalize, and bundle model-ready features from the patient intake and lab record.
                </p>
              </div>
              <div className={`analysis-status-chip analysis-status-chip--${pipeline.missingCount ? "idle" : "complete"}`}>
                {patient.backendProcessing.pipelineStatus || pipeline.pipelineStatus}
              </div>
            </div>
            <div className="backend-control-grid">
              <label>
                <span>Pipeline status</span>
                <select
                  value={patient.backendProcessing.pipelineStatus}
                  onChange={(e) => updateSection("backendProcessing", { pipelineStatus: e.target.value })}
                >
                  <option value="Draft">Draft</option>
                  <option value="Validating">Validating</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Ready for scoring">Ready for scoring</option>
                </select>
              </label>
              <label>
                <span>Feature count</span>
                <input
                  type="number"
                  value={patient.backendProcessing.featureCount}
                  onChange={(e) => updateSection("backendProcessing", { featureCount: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="analysis-control__buttons">
              <button type="button" className="button button--primary" onClick={syncPipeline}>
                Run feature engineering pipeline
              </button>
              <button type="button" className="button button--ghost" onClick={resetPipeline}>
                Reset pipeline
              </button>
            </div>
            <div className="backend-summary-grid">
              <div className="summary-pill">
                <span>Raw fields</span>
                <strong>{pipeline.rawCount}</strong>
              </div>
              <div className="summary-pill">
                <span>Cleaned fields</span>
                <strong>{pipeline.cleanedCount}</strong>
              </div>
              <div className="summary-pill">
                <span>Encoded features</span>
                <strong>{pipeline.encodedCount}</strong>
              </div>
              <div className="summary-pill">
                <span>Engineered features</span>
                <strong>{pipeline.engineeredCount}</strong>
              </div>
              <div className="summary-pill">
                <span>Missing values</span>
                <strong>{pipeline.missingCount}</strong>
              </div>
            </div>
            <div className="backend-speed-grid">
              <div className="backend-speed-card">
                <span>Processing latency</span>
                <strong>{pipeline.estimatedLatencyMs} ms</strong>
                <p>Estimated time to complete the feature engineering pass.</p>
              </div>
              <div className="backend-speed-card">
                <span>Throughput</span>
                <strong>{pipeline.estimatedThroughput} rows/sec</strong>
                <p>Approximate pipeline throughput on the reference device.</p>
              </div>
              <div className="backend-speed-card">
                <span>Bundle size</span>
                <strong>{pipeline.estimatedBundleSizeKb} KB</strong>
                <p>Compressed feature bundle size before model scoring.</p>
              </div>
              <div className="backend-speed-card">
                <span>Memory footprint</span>
                <strong>{pipeline.estimatedMemoryMb} MB</strong>
                <p>Estimated working set during backend processing.</p>
              </div>
            </div>
          </section>

          <section className="backend-stage-card">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Pipeline stages</p>
                <h3>Feature engineering flow</h3>
              </div>
              <p className="section-card__description">
                The sequence below traces the raw data into normalized, model-ready features.
              </p>
            </div>
            <PipelineTimelineCard stages={pipeline.stages} />
          </section>
        </div>
      }
      right={
        <div className="section-stack">
          <div className="callout callout--soft">
            <strong>Backend trace</strong>
            <p>
              This page now computes a reusable feature bundle from the current patient record and exposes the
              derived feature count to the model hub.
            </p>
          </div>

          <FeatureEngineeringChart features={pipeline.engineeredFeatures} />

          <section className="backend-feature-card backend-encoding-card">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Encoding steps</p>
                <h3>Encoded categorical signals</h3>
              </div>
              <p className="section-card__description">
                Categorical values are converted into numeric model inputs before the engineered features are bundled.
              </p>
            </div>
            <div className="backend-feature-list">
              {pipeline.encodedFeatures.map((feature) => (
                <article key={feature.name} className="backend-feature-item">
                  <div className="backend-feature-item__top">
                    <strong>{feature.name}</strong>
                    <span>{Math.round(feature.value * 100)}%</span>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, feature.value * 100)}%` }} />
                  </div>
                  <p>{feature.source}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="backend-feature-card">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Derived features</p>
                <h3>Top engineered signals</h3>
              </div>
              <p className="section-card__description">The strongest engineered features are ready for scoring and export.</p>
            </div>
            <div className="backend-feature-list">
              {pipeline.engineeredFeatures.slice(0, 6).map((feature) => (
                <article key={feature.name} className="backend-feature-item">
                  <div className="backend-feature-item__top">
                    <strong>{feature.name}</strong>
                    <span>{Math.round(feature.value * 100)}%</span>
                  </div>
                  <div className="bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(8, feature.value * 100)}%` }} />
                  </div>
                  <p>{feature.source}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="backend-feature-card">
            <p className="eyebrow">Validation summary</p>
            <h3>What the pipeline is ready for</h3>
            <ul className="bullet-list">
              <li>{pipeline.cleanedCount} of {pipeline.rawCount} inputs are clean and usable.</li>
              <li>{pipeline.engineeredCount} derived features are available for model scoring.</li>
              <li>{pipeline.missingCount === 0 ? "No missing values remain in the current bundle." : `${pipeline.missingCount} missing values still need attention.`}</li>
              <li>{pipeline.pipelineStatus} is the current bundle state.</li>
            </ul>
          </section>
        </div>
      }
      footer="This route now performs feature engineering, validation, and bundle preparation before the model hub consumes the output."
    />
  );
}

function ModelAnalyticalHubPage() {
  const { patient, modelResults, updateSection } = usePatient();
  const step = flowSteps[6];
  const hubGroups = React.useMemo(() => getModelHubGroups(), []);
  const activeModel = React.useMemo(
    () => hubGroups.catalog.find((model) => model.name === patient.modelHub.activeModel) || hubGroups.catalog[0] || null,
    [hubGroups.catalog, patient.modelHub.activeModel],
  );
  const activeModelRank = React.useMemo(() => {
    if (!activeModel) {
      return null;
    }
    const ranked = [...hubGroups.catalog].sort((a, b) => (b.f1 ?? b.score ?? 0) - (a.f1 ?? a.score ?? 0));
    return ranked.findIndex((model) => model.key === activeModel.key) + 1;
  }, [activeModel, hubGroups.catalog]);
  const primaryModel = React.useMemo(
    () => [...hubGroups.catalog].sort((a, b) => (b.f1 ?? b.score ?? 0) - (a.f1 ?? a.score ?? 0))[0] || null,
    [hubGroups.catalog],
  );

  return (
    <StepSkeleton
      step={step}
      left={
        <div className="section-stack">
          <section className="model-hub-shell">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Model hub</p>
                <h3>Trained model inventory</h3>
                <p className="section-card__description">
                  Every trained model is organized into machine learning and deep learning families for faster review.
                </p>
              </div>
            </div>
            <ModelHubOverview groups={hubGroups} activeModel={patient.modelHub.activeModel} />
            <div className="model-hub-controls">
              <label>
                <span>Active model</span>
                <select
                  value={patient.modelHub.activeModel}
                  onChange={(e) => updateSection("modelHub", { activeModel: e.target.value })}
                >
                  {hubGroups.catalog.map((model) => (
                    <option key={model.key}>{model.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Review note</span>
                <textarea
                  rows="5"
                  value={patient.modelHub.reviewNote}
                  onChange={(e) => updateSection("modelHub", { reviewNote: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="model-hub-focus">
            <div className="section-card__head">
              <div>
                <p className="eyebrow">Model in use</p>
                <h3>Currently deployed model</h3>
              </div>
              <p className="section-card__description">
                The selected model stays visible as the hub anchor for downstream analysis and deployment.
              </p>
            </div>
            <div className="model-hub-focus__card">
              <div className="model-hub-focus__top">
                <strong>{activeModel?.name || "N/A"}</strong>
                <ModelFamilyBadge family={activeModel?.family} label={activeModel?.familyLabel || "Model"} />
              </div>
              <div className="model-hub-focus__metrics">
                <div>
                  <span>Primary model</span>
                  <strong>{primaryModel?.name || "N/A"}</strong>
                </div>
                <div>
                  <span>Rank</span>
                  <strong>{activeModelRank || "N/A"}</strong>
                </div>
                <div>
                  <span>F1</span>
                  <strong>{activeModel ? `${Math.round((activeModel.f1 ?? activeModel.score ?? 0) * 100)}%` : "N/A"}</strong>
                </div>
                <div>
                  <span>Latency</span>
                  <strong>{activeModel?.latencyMs ?? "N/A"} ms</strong>
                </div>
                <div>
                  <span>Memory</span>
                  <strong>{activeModel?.memoryMb ?? "N/A"} MB</strong>
                </div>
              </div>
              <p className="model-hub-focus__copy">
                {primaryModel?.name || "The primary model"} is the strongest single detector in the current catalog, while {activeModel?.variantLabel || "the trained model"} remains the current selection.
              </p>
            </div>
          </section>

          <ModelHubExplainabilityCard activeModel={activeModel} primaryModel={primaryModel} modelResults={modelResults} />
        </div>
      }
      right={
        <div className="section-stack">
          <AnalysisSection
            unlocked={true}
            eyebrow="Risk map"
            title="Model risk map"
            description="Score and latency are plotted together so the full trained catalog can be compared at a glance."
          >
            <DecisionRiskMap models={hubGroups.catalog} />
          </AnalysisSection>

          <ModelHubFamilyCard
            family="ML"
            title="Machine learning models"
            description="Classical detectors and ensemble-style approaches that operate on engineered feature bundles."
            models={hubGroups.ml}
          />

          <ModelHubFamilyCard
            family="DL"
            title="Deep learning models"
            description="Neural models that learn higher-order representations and sequence-aware patterns."
            models={hubGroups.dl}
          />

          <section className="model-hub-notes">
            <div className="callout callout--accent">
              <strong>Hub summary</strong>
              <p>
                The model hub now lists every trained model, separates ML from DL families, and keeps the active model
                pinned to the current review state.
              </p>
            </div>
            <div className="mini-metrics">
              <div>
                <span>Families</span>
                <strong>2</strong>
              </div>
              <div>
                <span>Total models</span>
                <strong>{hubGroups.allCount}</strong>
              </div>
            </div>
          </section>
        </div>
      }
      footer="This final hub now catalogues all trained models by ML and DL family and keeps the active model visible for review."
    />
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <PatientProvider>
        <AppShell />
      </PatientProvider>
    ),
    children: [
      { index: true, element: <Navigate to={`/${firstStepSlug}`} replace /> },
      {
        element: <StepGuard />,
        children: [
          { path: "patient-details", element: <PatientDetailsPage /> },
          { path: "lab-investigation", element: <LabInvestigationPage /> },
          { path: "patient-care-insights", element: <PatientCareInsightsPage /> },
          { path: "comparative-analysis", element: <ComparativeAnalysisPage /> },
          { path: "decision-support", element: <DecisionSupportPage /> },
          { path: "backend-processing", element: <BackendProcessingPage /> },
          { path: "model-analytical-hub", element: <ModelAnalyticalHubPage /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
