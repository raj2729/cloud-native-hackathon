import React from "react";
import { useEffect, useState } from "react";
import LegacyPage from "./LegacyPage.jsx";

export default function App() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");

  useEffect(() => {
    const slides = [...document.querySelectorAll("#main-slide .carousel-item")];
    const indicators = [...document.querySelectorAll("#main-slide .carousel-indicators li")];
    const selectSlide = (index) => {
      if (!slides.length) return;
      const next = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("active", slideIndex === next);
      });
      indicators.forEach((indicator, slideIndex) => {
        indicator.classList.toggle("active", slideIndex === next);
      });
      setActiveSlide(next);
    };

    const handleClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const slideControl = target.closest("#main-slide .carousel-control-prev, #main-slide .carousel-control-next, #main-slide .carousel-indicators [data-slide-to]");
      if (slideControl) {
        event.preventDefault();
        const slideIndex = slideControl.dataset.slideTo;
        if (slideIndex !== undefined) {
          selectSlide(Number(slideIndex));
        } else {
          selectSlide(activeSlide + (slideControl.classList.contains("carousel-control-next") ? 1 : -1));
        }
        return;
      }

      const tab = target.closest(".schedule-tab-title .nav-link");
      if (tab) {
        event.preventDefault();
        const tabList = tab.closest(".nav-tabs");
        const tabContent = document.querySelector(tab.getAttribute("href"));
        tabList?.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link === tab));
        tab.closest(".schedule-area")?.querySelectorAll(".tab-pane").forEach((pane) => {
          const isActive = pane === tabContent;
          pane.classList.toggle("active", isActive);
          pane.classList.toggle("show", isActive);
        });
        return;
      }

      const collapseToggle = target.closest('[data-toggle="collapse"]');
      if (collapseToggle) {
        const collapse =
          collapseToggle.closest(".card")?.querySelector(".collapse") ??
          document.querySelector(collapseToggle.dataset.target);
        if (!collapse) return;
        event.preventDefault();
        const isOpen = collapse.classList.contains("show");
        const parent = collapse.closest(".accordion, .tab-pane");
        parent?.querySelectorAll(".collapse.show").forEach((item) => item.classList.remove("show"));
        parent?.querySelectorAll('[data-toggle="collapse"]').forEach((item) => item.setAttribute("aria-expanded", "false"));
        collapse.classList.toggle("show", !isOpen);
        collapseToggle.setAttribute("aria-expanded", String(!isOpen));
        collapseToggle.classList.toggle("collapsed", isOpen);
        return;
      }

      const menuToggle = target.closest(".navbar-toggler");
      if (menuToggle) {
        const menu = document.querySelector("#main-navbar");
        const isOpen = menu?.classList.toggle("show") ?? false;
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        return;
      }

      const navLink = target.closest("#main-navbar .nav-link");
      if (navLink && window.innerWidth < 992) {
        document.querySelector("#main-navbar")?.classList.remove("show");
        document.querySelector(".navbar-toggler")?.setAttribute("aria-expanded", "false");
      }

      const lightboxLink = target.closest("a.lightbox");
      if (lightboxLink) {
        event.preventDefault();
        setLightboxImage(lightboxLink.href);
      }
    };

    const handleSubmit = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.closest(".subscribe-inner, .footer-area")) return;
      event.preventDefault();
      setSubscriptionMessage("Thanks for subscribing!");
      form.reset();
    };

    const handleScroll = () => {
      document.querySelectorAll(".back-to-top").forEach((link) => {
        link.classList.toggle("visible", window.scrollY > 200);
      });
      document.querySelector(".scrolling-navbar")?.classList.toggle("top-nav-collapse", window.scrollY > 200);
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    window.addEventListener("scroll", handleScroll, { passive: true });
    const carouselTimer = window.setInterval(() => selectSlide(activeSlide + 1), 5000);
    handleScroll();

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("scroll", handleScroll);
      window.clearInterval(carouselTimer);
    };
  }, [activeSlide]);

  return (
    <>
      <LegacyPage />
      {subscriptionMessage && (
        <div className="subscription-notice" role="status">
          {subscriptionMessage}
          <button type="button" onClick={() => setSubscriptionMessage("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {lightboxImage && (
        <div
          className="react-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery image"
          onClick={() => setLightboxImage(null)}
        >
          <button type="button" aria-label="Close image" onClick={() => setLightboxImage(null)}>
            ×
          </button>
          <img src={lightboxImage} alt="Event gallery" />
        </div>
      )}
    </>
  );
}
