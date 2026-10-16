class PostsController < ApplicationController
  before_action :authenticate_user!, except: [:index, :show]

  def index
    @featured = Post.all.sample
  end

  def create
  end

  def publish
  end
end
