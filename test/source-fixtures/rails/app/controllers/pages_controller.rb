class PagesController < ApplicationController
  def home
    @now = Time.current
  end

  def about
  end
end
