import StandardPage from "./pages/StandardPage";

// This is a template App.tsx
// Customize the StandardPage props or replace with your own components

function App() {
  return (
    <StandardPage
      title="App Name"
      description="App description goes here"
      stats={[
        { title: "Total Items", value: 0, format: "number" },
        { title: "Revenue", value: 0, format: "currency" },
        { title: "Growth", value: 0, format: "percentage" },
        { title: "Active", value: 0, format: "number" },
      ]}
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: <div className="p-4">Overview content</div>,
        },
        {
          id: "details",
          label: "Details",
          content: <div className="p-4">Details content</div>,
        },
      ]}
    />
  );
}

export default App;
