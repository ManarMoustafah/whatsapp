import backgroundImageFile from "../../assets/backgroung.png";

const Spinner = () => {
  const containerStyle = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundImage: `url(${backgroundImageFile})`,
    backgroundColor: "#ece5dd",

  
  backgroundSize: '100%', /* يتحكم في حجم الصورة، يمكنك تعديل الرقم حسب رغبتك */
  backgroundRepeat: 'repeat',
    
    backgroundPosition: "center",
  };

  // تنسيق الدائرة الكلاسيكية
  const spinnerStyle = {
    width: "40px",
    height: "40px",
    border: "5px solid #054d1d",
    borderTop: "5px solid #28d353",
    borderRadius: "50%",
  };

  return (
    <div style={containerStyle}>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <div
          style={{ ...spinnerStyle, animation: "spin 1s linear infinite" }}
        ></div>
        <div
          style={{
            marginTop: "15px",
            color: "#258042",
            fontSize: "28px",
            fontWeight: "bold",
          }}
        >
          Loading...
        </div>
      </div>
    </div>
  );
};

export default Spinner;
