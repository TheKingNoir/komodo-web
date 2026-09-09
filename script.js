const words = [
  { text: "Hosting 24/7", color: "#486FD8" },
  { text: "Web Development", color: "#434045" },
  { text: "Números Virtuales", color: "#c73330" },
  { text: "Bots de Telegram", color: "#24A1DE" },
  { text: "API de IA", color: "#29ec22" },
  { text: "VPS Cloud", color: "#5865F2" },
  { text: "Bots de WhatsApp", color: "#25D366" }
];
const element = document.getElementById("animatedText");
let wordIndex = 0;
let charIndex = 0;
let deleting = false;
const typingSpeed = 85;
const deletingSpeed = 45;
const pauseTime = 1700;
function animateText() {
  const current = words[wordIndex];
  element.style.color = current.color;
  if (!deleting) {
    element.textContent = current.text.substring(0, charIndex + 1);
    charIndex++;
    if (charIndex === current.text.length) {
      deleting = true;
      setTimeout(animateText, pauseTime);
      return;
    }
    setTimeout(animateText, typingSpeed);
  } else {
    element.textContent = current.text.substring(0, charIndex - 1);
    charIndex--;
    if (charIndex === 0) {
      deleting = false;
      wordIndex++;
      if (wordIndex >= words.length) {
        wordIndex = 0;
      }
    }
    setTimeout(animateText, deletingSpeed);
  }
}
animateText();
document.addEventListener("DOMContentLoaded", function () {
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  const overlay = document.createElement("div");
  overlay.className = "menu-overlay";
  document.body.appendChild(overlay);
  function toggleMenu() {
    menuToggle.classList.toggle("active");
    mobileMenu.classList.toggle("active");
    overlay.classList.toggle("active");
    document.body.style.overflow = mobileMenu.classList.contains("active") ? "hidden" : "";
  }
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenu();
    });
    const links = mobileMenu.querySelectorAll("a");
    links.forEach((link) => {
      link.addEventListener("click", function () {
        if (mobileMenu.classList.contains("active")) {
          toggleMenu();
        }
      });
    });
    overlay.addEventListener("click", function () {
      if (mobileMenu.classList.contains("active")) {
        toggleMenu();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobileMenu.classList.contains("active")) {
        toggleMenu();
      }
    });
  }
});
document.addEventListener("DOMContentLoaded", function () {
  const heroImageElement = document.getElementById("heroMainImage");
  if (window.innerWidth <= 768) return;
  const images = ["images/hero.png", "images/hero2.png", "images/hero3.png"];
  let currentIndex = 0;
  setInterval(() => {
    heroImageElement.classList.add("fade-out");
    setTimeout(() => {
      currentIndex = (currentIndex + 1) % images.length;
      heroImageElement.src = images[currentIndex];
      heroImageElement.classList.remove("fade-out");
    }, 500);
  }, 5000);
});
document.addEventListener("DOMContentLoaded", function () {
  function isMobile() {
    return window.innerWidth <= 768;
  }
  if (!isMobile()) return;
  const serviceCards = document.querySelectorAll(".service-card");
  serviceCards.forEach((card) => {
    const image = card.querySelector(".service-image");
    const wrapper = card.querySelector(".service-content-wrapper");
    const name = card.querySelector(".service-name");
    if (!image || !wrapper || !name) return;
    card.innerHTML = "";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.width = "100%";
    card.style.maxWidth = "100%";
    const imageClone = image.cloneNode(true);
    imageClone.style.width = "100%";
    imageClone.style.height = "200px";
    imageClone.style.display = "block";
    imageClone.style.objectFit = "cover";
    imageClone.style.order = "0";
    card.appendChild(imageClone);
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "service-toggle-btn";
    if (card.classList.contains("phone-card") || name.classList.contains("phone-title")) {
      toggleBtn.classList.add("phone-btn");
    } else if (card.classList.contains("ai-card") || name.classList.contains("ai-title")) {
      toggleBtn.classList.add("ai-btn");
    }
    toggleBtn.innerHTML = `
            ${name.textContent}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        `;
    toggleBtn.style.order = "1";
    toggleBtn.style.width = "100%";
    toggleBtn.style.border = "none";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.style.color = "#ffffff";
    toggleBtn.style.fontSize = "16px";
    toggleBtn.style.fontWeight = "700";
    toggleBtn.style.padding = "16px 20px";
    toggleBtn.style.display = "flex";
    toggleBtn.style.alignItems = "center";
    toggleBtn.style.justifyContent = "space-between";
    toggleBtn.style.borderRadius = "0";
    card.appendChild(toggleBtn);
    const collapsible = document.createElement("div");
    collapsible.className = "service-collapsible-content";
    collapsible.style.order = "2";
    collapsible.style.width = "100%";
    collapsible.style.maxHeight = "0";
    collapsible.style.overflow = "hidden";
    collapsible.style.transition = "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
    collapsible.style.background = "#ffffff";
    const wrapperClone = wrapper.cloneNode(true);
    collapsible.appendChild(wrapperClone);
    card.appendChild(collapsible);
    toggleBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      serviceCards.forEach((otherCard) => {
        if (otherCard !== card) {
          const otherContent = otherCard.querySelector(".service-collapsible-content");
          const otherBtn = otherCard.querySelector(".service-toggle-btn");
          if (otherContent && otherContent.style.maxHeight !== "0px") {
            otherContent.style.maxHeight = "0px";
            if (otherBtn) otherBtn.classList.remove("open");
          }
        }
      });
      const isOpen = collapsible.style.maxHeight !== "0px";
      collapsible.style.maxHeight = isOpen ? "0px" : "800px";
      toggleBtn.classList.toggle("open");
    });
  });
});
