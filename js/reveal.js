document.addEventListener("DOMContentLoaded", function () {
  const reveals = document.querySelectorAll(".reveal");

  function revealOnScroll() {
    const windowHeight = window.innerHeight;
    for (let i = 0; i < reveals.length; i++) {
      const elementTop = reveals[i].getBoundingClientRect().top;
      const elementBottom = reveals[i].getBoundingClientRect().bottom;

      // Nếu element nằm trong viewport thì thêm class active
      if (elementTop < windowHeight - 50 && elementBottom > 50) {
        reveals[i].classList.add("active");
      } else {
        // Khi element ra khỏi viewport thì remove để lần sau scroll vào sẽ chạy lại animation
        reveals[i].classList.remove("active");
      }
    }
  }

  window.addEventListener("scroll", revealOnScroll);
  revealOnScroll();

  // Handle image orientation for gallery
  const galleryImages = document.querySelectorAll(".gallery img");
  galleryImages.forEach((img) => {
    const handleLoad = () => {
      if (img.naturalHeight > img.naturalWidth) {
        img.classList.add("portrait");
      } else {
        img.classList.add("landscape");
      }
    };
    if (img.complete) {
      handleLoad();
    } else {
      img.addEventListener("load", handleLoad);
    }
  });
});
